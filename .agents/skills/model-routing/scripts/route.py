#!/usr/bin/env python3
"""Offline worker selection. This does not dispatch, authenticate or reserve quota."""

import argparse
from datetime import datetime, timezone
from decimal import Decimal, DecimalException
import json
import math
from pathlib import Path
import sys


LEVELS = {'metadata': 0, 'smoke': 1, 'role-validated': 2}
T3_ROLES = {
    'code': 'implementation',
    'implementation': 'implementation',
    'review': 'review',
    'research': 'research',
    'design': 'design',
    'plan': 'design',
    'test': 'test',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value, label, integer=False):
    finite = (type(value) is int or type(value) is float and math.isfinite(value)
              or type(value) is Decimal and value.is_finite())
    require(finite and value >= 0,
            label + ' must be a finite nonnegative number')
    require(not integer or type(value) is int, label + ' must be an integer')


def money(value, label):
    number(value, label)
    amount = Decimal(str(value))
    require(amount <= Decimal('1000000') and amount == amount.quantize(Decimal('0.000001')),
            label + ' requires USD in millionths, between zero and one million')


def string(value, label):
    require(isinstance(value, str) and bool(value.strip()), label + ' must be nonempty text')


def boolean(value, label):
    require(type(value) is bool, label + ' must be boolean')


def strings(value, label):
    require(isinstance(value, list), label + ' must be an array')
    for item in value:
        string(item, label)


def keys(value, required, optional=()):
    require(isinstance(value, dict), 'expected an object')
    require(set(required) <= value.keys(), 'required fields missing')
    require(value.keys() <= set(required) | set(optional), 'unknown fields are not allowed')


def timestamp(value):
    string(value, 'timestamp')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(parsed.tzinfo is not None, 'timestamp needs an explicit timezone')
        return parsed
    except (ValueError, OverflowError) as exc:
        raise ValueError('invalid timestamp') from exc


def fresh(value, current, hours):
    age = (current - timestamp(value)).total_seconds()
    return 0 <= age <= hours * 3600


def route_ref(value):
    keys(value, ('provider_instance', 'model'), ('options',))
    string(value.get('provider_instance'), 'provider_instance')
    string(value.get('model'), 'model')
    options = value.get('options', {})
    require(isinstance(options, dict), 'options must be an object')
    for key, option in options.items():
        string(key, 'option name')
        require(type(option) in (str, bool), 'option must be text or boolean')


def validate(catalog, profile, task, state):
    for name, obj in [('catalog', catalog), ('profile', profile), ('task', task), ('state', state)]:
        require(isinstance(obj, dict), name + ' must be an object')
        require(type(obj.get('schema_version')) is int and obj['schema_version'] == 1,
                name + ' schema_version must be 1')
    keys(catalog, ('schema_version', 'observed_at', 'models'))
    keys(profile, ('schema_version', 'catalog_max_age_hours', 'evidence_max_age_days', 'max_paid_usd',
                   'max_workers', 'max_attempts', 'max_requested_tokens', 'account_limits',
                   'data_policy', 'reserved_routes', 'role_preferences'))
    keys(task, ('schema_version', 'kind', 'role', 'data_class', 'input_modalities', 'requires_tools',
                'requires_sudo', 'contains_credentials', 'paid_authorized', 'input_tokens',
                'output_tokens', 'max_paid_usd', 'min_evidence', 'acceptance', 'required_host', 'pin'))
    keys(state, ('schema_version', 'observed_at', 'workers', 'attempts', 'requested_tokens',
                 'spent_usd', 'accounts', 'failed_routes'))
    timestamp(catalog.get('observed_at'))
    require(isinstance(catalog.get('models'), list), 'models must be an array')
    seen = set()
    for model in catalog['models']:
        keys(model, ('provider_instance', 'model', 'account_group', 'enabled', 'available', 'billing',
                     'locality', 'host', 'data_classes', 'inputs', 'tools', 'context_tokens',
                     'output_tokens', 'options', 'evidence'),
                    ('input_tokens_limit', 'environment_id', 'upper_bound_usd', 'spend_cap_enforced'))
        route_ref({key: model.get(key) for key in ('provider_instance', 'model')})
        key = (model['provider_instance'], model['model'])
        require(key not in seen, 'duplicate provider/model route')
        seen.add(key)
        string(model.get('account_group'), 'account_group')
        for field in ('enabled', 'available'):
            boolean(model.get(field), field)
        require(model.get('billing') in ('free', 'subscription', 'metered', 'unknown'), 'invalid billing')
        require(model.get('locality') in ('local', 'owned-remote', 'cloud', 'unknown'), 'invalid locality')
        if model.get('host') is not None:
            string(model['host'], 'host')
        if model.get('environment_id') is not None:
            string(model['environment_id'], 'environment_id')
        for field in ('data_classes', 'inputs'):
            strings(model.get(field), field)
        require(model.get('tools') is None or type(model['tools']) is bool, 'tools must be boolean or null')
        for field in ('context_tokens', 'input_tokens_limit', 'output_tokens'):
            if model.get(field) is not None:
                number(model[field], field, integer=True)
        if model.get('upper_bound_usd') is not None:
            money(model['upper_bound_usd'], 'upper_bound_usd')
        if 'spend_cap_enforced' in model:
            boolean(model['spend_cap_enforced'], 'spend_cap_enforced')
        require(isinstance(model.get('options'), dict), 'model options must be an object')
        for key, choices in model['options'].items():
            string(key, 'option name')
            require(isinstance(choices, list) and len(choices) > 0, 'option needs advertised choices')
            for choice in choices:
                require(type(choice) in (str, bool), 'advertised option must be text or boolean')
        require(isinstance(model['evidence'], list), 'evidence must be an array')
        for record in model['evidence']:
            keys(record, ('level', 'observed_at', 'role', 'options'))
            require(record['level'] in LEVELS, 'invalid evidence level')
            timestamp(record['observed_at'])
            string(record['role'], 'evidence role')
            route_ref({'provider_instance': model['provider_instance'], 'model': model['model'], 'options': record['options']})
    for field in ('catalog_max_age_hours', 'evidence_max_age_days'):
        number(profile.get(field), field)
    money(profile.get('max_paid_usd'), 'profile max_paid_usd')
    require(profile['catalog_max_age_hours'] <= 168, 'catalog age ceiling is seven days')
    require(profile['evidence_max_age_days'] <= 365, 'role evidence age ceiling is one year')
    for field in ('max_workers', 'max_attempts', 'max_requested_tokens'):
        number(profile.get(field), field, integer=True)
    require(isinstance(profile.get('account_limits'), dict), 'account_limits must be an object')
    for account, limit in profile['account_limits'].items():
        string(account, 'account')
        number(limit, 'account limit', integer=True)
    require(isinstance(profile['data_policy'], dict), 'data_policy must be an object')
    for provider, policy in profile['data_policy'].items():
        string(provider, 'policy provider')
        keys(policy, ('data_classes', 'localities'))
        strings(policy['data_classes'], 'policy data classes')
        strings(policy['localities'], 'policy localities')
        require(set(policy['localities']) <= {'local', 'owned-remote', 'cloud'}, 'unknown locality is ineligible')
    require(isinstance(profile.get('reserved_routes'), list), 'reserved_routes must be an array')
    for reserved in profile['reserved_routes']:
        keys(reserved, ('provider_instance', 'prefix'))
        string(reserved.get('provider_instance'), 'reserved provider')
        string(reserved.get('prefix'), 'reserved prefix')
    require(isinstance(profile.get('role_preferences'), dict), 'role_preferences must be an object')
    for role, refs in profile['role_preferences'].items():
        string(role, 'role')
        require(isinstance(refs, list), 'role routes must be an array')
        for ref in refs:
            route_ref(ref)
    require(task.get('kind') in ('quick', 'work'), 'invalid task kind')
    for field in ('role', 'data_class'):
        string(task.get(field), field)
    strings(task['input_modalities'], 'input_modalities')
    require(bool(task['input_modalities']), 'at least one input modality is required')
    for field in ('requires_tools', 'requires_sudo', 'contains_credentials', 'paid_authorized'):
        boolean(task.get(field), field)
    for field in ('input_tokens', 'output_tokens'):
        number(task.get(field), field, integer=True)
        require(task[field] > 0 or task['kind'] == 'quick', 'work token estimates must be positive')
    money(task.get('max_paid_usd'), 'task max_paid_usd')
    require(task.get('min_evidence') in LEVELS, 'invalid min_evidence')
    strings(task.get('acceptance'), 'acceptance')
    if task.get('required_host') is not None:
        string(task['required_host'], 'required_host')
    if task.get('pin') is not None:
        route_ref(task['pin'])
    for field in ('workers', 'attempts', 'requested_tokens'):
        number(state.get(field), field, integer=True)
    require(state['workers'] <= state['attempts'], 'active workers cannot exceed launched attempts')
    money(state.get('spent_usd'), 'spent_usd')
    timestamp(state.get('observed_at'))
    require(isinstance(state['failed_routes'], list), 'failed_routes must be an array')
    for failed in state['failed_routes']:
        route_ref(failed)
    require(isinstance(state.get('accounts'), dict), 'accounts must be an object')
    for account, usage in state['accounts'].items():
        string(account, 'account')
        keys(usage, ('observed_at', 'in_flight', 'throttled'))
        timestamp(usage['observed_at'])
        number(usage.get('in_flight'), 'in_flight', integer=True)
        boolean(usage.get('throttled'), 'throttled')


def select(catalog, profile, task, state, now=None):
    validate(catalog, profile, task, state)
    current = timestamp(now) if now is not None else datetime.now(timezone.utc)
    if task['requires_sudo'] or task['contains_credentials']:
        return {'status': 'parent', 'executor': 'authorized_tool',
                'reason': 'Keep credentials out of all model contexts; use the authorized tool boundary.'}
    if task['kind'] == 'quick':
        return {'status': 'parent', 'reason': 'Answer the quick question directly.'}
    if not task['acceptance']:
        return {'status': 'blocked', 'reason': 'An independent acceptance check is required.'}
    requested = task['input_tokens'] + task['output_tokens']
    if (state['workers'] >= profile['max_workers'] or state['attempts'] >= profile['max_attempts']
            or state['requested_tokens'] + requested > profile['max_requested_tokens']):
        return {'status': 'blocked', 'reason': 'Worker, attempt or requested-token budget exhausted.'}
    if not fresh(catalog['observed_at'], current, profile['catalog_max_age_hours']):
        return {'status': 'blocked', 'reason': 'Catalog observation is stale or in the future.'}
    if not fresh(state['observed_at'], current, 5 / 60):
        return {'status': 'blocked', 'reason': 'Account/work snapshot must be refreshed within five minutes of selection.'}
    refs = [task['pin']] if task.get('pin') else profile['role_preferences'].get(task['role'], [])
    models = {(m['provider_instance'], m['model']): m for m in catalog['models']}
    rejected = []
    for ref in refs:
        model = models.get((ref['provider_instance'], ref['model']))
        reasons = []
        if model is None:
            rejected.append({**ref, 'reasons': ['not in catalog']})
            continue
        if any(failed['provider_instance'] == ref['provider_instance'] and failed['model'] == ref['model']
               and ('options' not in failed or failed['options'] == ref.get('options', {}))
               for failed in state['failed_routes']):
            reasons.append('route/settings already failed in this job')
        if not model['enabled'] or not model['available']:
            reasons.append('disabled or availability unverified')
        if any(r['provider_instance'] == model['provider_instance'] and model['model'].startswith(r['prefix'])
               for r in profile['reserved_routes']):
            reasons.append('reserved lane')
        policy = profile['data_policy'].get(model['provider_instance'], {})
        if (task['data_class'] not in model['data_classes'] or task['data_class'] not in policy.get('data_classes', [])
                or model['locality'] not in policy.get('localities', []) or model['locality'] == 'unknown'):
            reasons.append('data class not permitted')
        if task.get('required_host') and (model['locality'] != 'local' or model.get('host') != task['required_host']):
            reasons.append('required inference host not satisfied')
        if task.get('required_host') and not model.get('environment_id'):
            reasons.append('execution environment for required host is unbound')
        if not set(task['input_modalities']) <= set(model['inputs']):
            reasons.append('input modality not advertised')
        if task['requires_tools'] and model['tools'] is not True:
            reasons.append('tools unverified')
        if model.get('context_tokens') is None or requested > model['context_tokens']:
            reasons.append('context limit unknown or insufficient')
        if model.get('input_tokens_limit') is not None and task['input_tokens'] > model['input_tokens_limit']:
            reasons.append('input limit insufficient')
        if model.get('output_tokens') is None:
            if model['billing'] == 'metered':
                reasons.append('output limit unknown or insufficient')
        elif task['output_tokens'] > model['output_tokens']:
            reasons.append('output limit unknown or insufficient')
        if not any(record['role'] == task['role'] and record['options'] == ref.get('options', {})
                   and LEVELS[record['level']] >= LEVELS[task['min_evidence']]
                   and fresh(record['observed_at'], current, profile['evidence_max_age_days'] * 24)
                   for record in model['evidence']):
            reasons.append('fresh role/setting evidence insufficient')
        account = state['accounts'].get(model['account_group'])
        limit = profile['account_limits'].get(model['account_group'])
        if (account is None or limit is None or account['throttled'] or account['in_flight'] >= limit
                or not fresh(account['observed_at'], current, 5 / 60)):
            reasons.append('shared account state unknown, throttled or full')
        billing = model['billing']
        if billing == 'unknown':
            reasons.append('billing unknown')
        if billing == 'metered':
            bound = model.get('upper_bound_usd')
            cap = min(profile['max_paid_usd'], task['max_paid_usd'])
            if (not task['paid_authorized'] or model.get('spend_cap_enforced') is not True
                    or bound is None or bound <= 0 or cap <= 0
                    or Decimal(str(state['spent_usd'])) + Decimal(str(bound)) > Decimal(str(cap))):
                reasons.append('metered cost not explicitly authorized and bounded')
        options = ref.get('options', {})
        if any(key not in model['options'] or not any(type(value) is type(choice) and value == choice
                   for choice in model['options'].get(key, [])) for key, value in options.items()):
            reasons.append('unsupported option name or value')
        if reasons:
            rejected.append({**ref, 'reasons': reasons})
            continue
        return {'status': 'selected', 'dispatch_fields': {
                    'target': {'providerInstanceId': model['provider_instance'], 'model': model['model'], 'options': options,
                               **({'environmentId': model['environment_id']} if model.get('environment_id') else {})},
                    'role': T3_ROLES.get(task['role'], 'general'), 'mode': 'async'},
                'account_group': model['account_group'], 'requested_tokens': requested,
                'billing': billing, 'reserved_usd': float(model['upper_bound_usd']) if billing == 'metered' else 0,
                'provider_token_limit_enforced': False,
                'output_limit_unverified': model.get('output_tokens') is None,
                'verification': task['acceptance'],
                'rejected': rejected,
                'reason': 'First eligible route in the task role preference order. Reserve and recheck before dispatch.'}
    return {'status': 'blocked', 'reason': 'Pinned route unavailable or no eligible preferred route.', 'rejected': rejected}


def load_json(path):
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'duplicate JSON key: ' + key)
            result[key] = value
        return result
    def invalid_constant(_):
        raise ValueError('non-finite JSON number')
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique_pairs,
                          parse_constant=invalid_constant, parse_float=Decimal)
    except DecimalException as exc:
        raise ValueError('invalid decimal number') from exc


def parse_route_spec(spec, option_pairs=()):
    require(':' in spec, 'route spec must use provider_instance:model format')
    provider, model_name = spec.split(':', 1)
    ref = {'provider_instance': provider.strip(), 'model': model_name.strip()}
    if option_pairs:
        opts = {}
        for pair in option_pairs:
            require('=' in pair, 'option must use key=value format')
            key, raw_val = pair.split('=', 1)
            key = key.strip()
            val = raw_val.strip()
            if val == 'true':
                opts[key] = True
            elif val == 'false':
                opts[key] = False
            else:
                opts[key] = val
        ref['options'] = opts
    return ref


def build_inline_task(args):
    pin = parse_route_spec(args.pin, args.pin_option) if args.pin else None
    return {
        'schema_version': 1,
        'kind': args.kind,
        'role': args.role,
        'data_class': args.data_class,
        'input_modalities': args.modality or ['text'],
        'requires_tools': not args.no_tools,
        'requires_sudo': args.requires_sudo,
        'contains_credentials': args.contains_credentials,
        'paid_authorized': False,
        'input_tokens': args.input_tokens,
        'output_tokens': args.output_tokens,
        'max_paid_usd': 0,
        'min_evidence': args.min_evidence,
        'acceptance': args.acceptance or [],
        'required_host': args.required_host,
        'pin': pin,
    }


def build_fresh_state(profile, now_iso, failed_specs):
    require(isinstance(profile, dict) and isinstance(profile.get('account_limits'), dict),
            'profile.account_limits must be an object for --fresh-state')
    failed_routes = []
    for spec in failed_specs or []:
        failed_routes.append(parse_route_spec(spec))
    return {
        'schema_version': 1,
        'observed_at': now_iso,
        'workers': 0,
        'attempts': len(failed_routes),
        'requested_tokens': 0,
        'spent_usd': 0,
        'accounts': {
            account: {'observed_at': now_iso, 'in_flight': 0, 'throttled': False}
            for account in profile['account_limits']
        },
        'failed_routes': failed_routes,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', required=True, type=Path)
    parser.add_argument('--profile', required=True, type=Path)
    parser.add_argument('--task', type=Path, help='Task JSON file (mutually exclusive with --role)')
    parser.add_argument('--state', type=Path, help='State JSON file (mutually exclusive with --fresh-state)')
    parser.add_argument('--now', help='Explicit timezone-bearing timestamp for reproducible evaluation')
    # Inline single-worker task flags
    parser.add_argument('--role', help='Inline task role (e.g. code, review, research, extract, plan, docs, triage)')
    parser.add_argument('--kind', choices=('work', 'quick'), default='work')
    parser.add_argument('--data-class', default='public', help='Data class (default: public)')
    parser.add_argument('--input-tokens', type=int, default=4000)
    parser.add_argument('--output-tokens', type=int, default=2000)
    parser.add_argument('--acceptance', action='append', help='Independent acceptance check (repeatable)')
    parser.add_argument('--no-tools', action='store_true', help='Task does not require tool calling')
    parser.add_argument('--modality', action='append', help='Required input modality (repeatable; default: text)')
    parser.add_argument('--min-evidence', default='smoke', choices=tuple(LEVELS))
    parser.add_argument('--required-host', default=None)
    parser.add_argument('--pin', help='Explicit route pin as provider_instance:model')
    parser.add_argument('--pin-option', action='append', default=[], help='Option for --pin as key=value (repeatable)')
    parser.add_argument('--requires-sudo', action='store_true')
    parser.add_argument('--contains-credentials', action='store_true')
    # Inline fresh state flags
    parser.add_argument('--fresh-state', action='store_true',
                        help='Synthesize a clean zero-usage state snapshot at --now (or current UTC)')
    parser.add_argument('--failed', action='append', default=[],
                        help='Route already failed in this job as provider_instance:model (repeatable with --fresh-state)')
    args = parser.parse_args()
    try:
        require(bool(args.task) != bool(args.role), 'provide exactly one of --task or --role')
        require(bool(args.state) != bool(args.fresh_state), 'provide exactly one of --state or --fresh-state')
        if args.failed:
            require(args.fresh_state, '--failed requires --fresh-state')
        if args.pin_option:
            require(bool(args.pin), '--pin-option requires --pin')
        catalog = load_json(args.catalog)
        profile = load_json(args.profile)
        now_iso = args.now if args.now is not None else datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        task = load_json(args.task) if args.task else build_inline_task(args)
        state = load_json(args.state) if args.state else build_fresh_state(profile, now_iso, args.failed)
        decision = select(catalog, profile, task, state, now=args.now if args.now is not None else now_iso)
    except (ValueError, OSError, KeyError, TypeError, OverflowError, RecursionError) as exc:
        print(json.dumps({'status': 'invalid', 'reason': str(exc)}))
        return 2
    print(json.dumps(decision, allow_nan=False))
    return 0 if decision['status'] in ('parent', 'selected') else 3


if __name__ == '__main__':
    sys.exit(main())
