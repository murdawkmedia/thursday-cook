import copy
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'route.py'
spec = importlib.util.spec_from_file_location('cook_route', SCRIPT)
route = importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)
NOW = '2026-11-21T12:00:00Z'


def model(provider, name, account, billing='free', **extra):
    return dict(provider_instance=provider, model=name, account_group=account,
                enabled=True, available=True, billing=billing,
                data_classes=['public', 'sanitized'], locality='cloud', host=None,
                inputs=['text'], tools=True, context_tokens=32768,
                output_tokens=4096, options={'variant': ['low', 'high']},
                evidence=[{'level': 'smoke', 'observed_at': NOW, 'role': role,
                           'options': settings} for role in ('extract', 'code')
                          for settings in ({}, {'variant': 'low'})], **extra)


class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.catalog = {'schema_version': 1, 'observed_at': NOW, 'models': [
            model('free', 'small', 'free-account'),
            model('plan', 'strong', 'plan-account', 'subscription')]}
        self.profile = {'schema_version': 1, 'catalog_max_age_hours': 24,
                        'evidence_max_age_days': 30, 'max_workers': 3,
                        'max_attempts': 2, 'max_requested_tokens': 20000,
                        'max_paid_usd': 0, 'reserved_routes': [],
                        'account_limits': {'free-account': 1, 'plan-account': 2},
                        'data_policy': {p: {'data_classes': ['public', 'sanitized'],
                                           'localities': ['cloud', 'local', 'owned-remote']}
                                        for p in ('free', 'plan')},
                        'role_preferences': {
                            'extract': [{'provider_instance': 'free', 'model': 'small',
                                         'options': {'variant': 'low'}},
                                        {'provider_instance': 'plan', 'model': 'strong'}],
                            'code': [{'provider_instance': 'plan', 'model': 'strong'},
                                     {'provider_instance': 'free', 'model': 'small'}]}}
        self.task = {'schema_version': 1, 'kind': 'work', 'role': 'extract',
                     'data_class': 'public', 'input_modalities': ['text'],
                     'requires_tools': False, 'requires_sudo': False,
                     'contains_credentials': False, 'input_tokens': 512,
                     'output_tokens': 1024, 'min_evidence': 'smoke',
                     'acceptance': ['Check all labels against the supplied fixture.'],
                     'max_paid_usd': 0, 'paid_authorized': False,
                     'required_host': None, 'pin': None}
        self.state = {'schema_version': 1, 'observed_at': NOW, 'workers': 0, 'attempts': 0,
                      'requested_tokens': 0, 'spent_usd': 0, 'failed_routes': [],
                      'accounts': {'free-account': {'observed_at': NOW, 'in_flight': 0, 'throttled': False},
                                   'plan-account': {'observed_at': NOW, 'in_flight': 0, 'throttled': False}}}

    def decide(self):
        return route.select(self.catalog, self.profile, self.task, self.state, now=NOW)

    def assertBlocked(self):
        self.assertEqual(self.decide()['status'], 'blocked')

    def test_quick_question_stays_in_parent(self):
        self.task['kind'] = 'quick'
        self.assertEqual(self.decide()['status'], 'parent')

    def test_suitable_free_route_produces_only_supported_delegate_fields(self):
        result = self.decide()
        self.assertEqual(result['status'], 'selected')
        self.assertEqual(result['dispatch_fields'], {
            'target': {'providerInstanceId': 'free', 'model': 'small',
                       'options': {'variant': 'low'}},
            'role': 'general', 'mode': 'async'})
        self.assertEqual(result['verification'], self.task['acceptance'])
        self.assertFalse(result['provider_token_limit_enforced'])

    def test_role_preferences_can_choose_stronger_subscription(self):
        self.task['role'] = 'code'
        self.task['requires_tools'] = True
        self.assertEqual(self.decide()['dispatch_fields']['target']['model'], 'strong')

    def test_key_aliases_share_throttle(self):
        alias = copy.deepcopy(self.catalog['models'][0])
        alias['model'] = 'small-alias'
        self.catalog['models'] = [self.catalog['models'][0], alias]
        self.profile['role_preferences']['extract'].insert(1, {
            'provider_instance': 'free', 'model': 'small-alias'})
        self.state['accounts']['free-account']['throttled'] = True
        self.assertBlocked()

    def test_key_aliases_share_concurrency(self):
        self.catalog['models'] = self.catalog['models'][:1]
        alias = copy.deepcopy(self.catalog['models'][0])
        alias['model'] = 'small-alias'
        self.catalog['models'].append(alias)
        self.profile['role_preferences']['extract'].append({'provider_instance': 'free', 'model': 'small-alias'})
        self.state['accounts']['free-account']['in_flight'] = 1
        self.assertBlocked()

    def test_reserved_lane_is_not_general_capacity(self):
        self.catalog['models'] = self.catalog['models'][:1]
        self.profile['reserved_routes'] = [{'provider_instance': 'free', 'prefix': 'small'}]
        self.assertBlocked()

    def test_loopback_forward_is_not_local_inference(self):
        self.task['data_class'] = 'private'
        self.task['required_host'] = 'host-a'
        for m in self.catalog['models']:
            self.profile['data_policy'][m['provider_instance']]['data_classes'] = ['private']
            m.update(data_classes=['private'], locality='owned-remote', host='host-a', environment_id='env-a')
        self.assertBlocked()
        for m in self.catalog['models']:
            m.update(locality='local', host='host-b')
        self.assertBlocked()

    def test_explicit_local_host_and_data_permission_can_match(self):
        self.task['data_class'] = 'private'
        self.task['required_host'] = 'host-a'
        self.profile['data_policy']['free']['data_classes'].append('private')
        self.catalog['models'][0].update(data_classes=['private'], locality='local', host='host-a', environment_id='env-a')
        self.assertEqual(self.decide()['dispatch_fields']['target']['model'], 'small')

    def test_sudo_stays_with_authorized_tool_runner(self):
        self.task['requires_sudo'] = True
        result = self.decide()
        self.assertEqual(result['status'], 'parent')
        self.assertEqual(result['executor'], 'authorized_tool')
        self.assertNotIn('dispatch_fields', result)

    def test_credentials_never_enter_a_model_route(self):
        self.task['contains_credentials'] = True
        self.assertEqual(self.decide()['executor'], 'authorized_tool')

    def test_explicit_unavailable_pin_does_not_substitute(self):
        self.task['pin'] = {'provider_instance': 'free', 'model': 'small'}
        self.catalog['models'][0]['available'] = False
        self.assertBlocked()

    def test_unsupported_reasoning_setting_is_not_coerced(self):
        self.task['pin'] = {'provider_instance': 'free', 'model': 'small',
                            'options': {'variant': 'xhigh'}}
        self.assertBlocked()

    def test_unsupported_option_name_is_not_inherited(self):
        self.task['pin'] = {'provider_instance': 'free', 'model': 'small',
                            'options': {'effort': 'high'}}
        self.assertBlocked()

    def test_zero_paid_budget_blocks_metered_route(self):
        self.catalog['models'] = self.catalog['models'][:1]
        self.catalog['models'][0].update(billing='metered', upper_bound_usd=0.01, spend_cap_enforced=True)
        self.assertBlocked()

    def test_unknown_billing_is_not_free(self):
        self.catalog['models'] = self.catalog['models'][:1]
        self.catalog['models'][0]['billing'] = 'unknown'
        self.assertBlocked()

    def test_positive_paid_cap_still_requires_explicit_authority(self):
        self.catalog['models'] = self.catalog['models'][:1]
        self.catalog['models'][0].update(billing='metered', upper_bound_usd=0.01, spend_cap_enforced=True)
        self.profile['max_paid_usd'] = self.task['max_paid_usd'] = 0.05
        self.assertBlocked()
        self.task['paid_authorized'] = True
        self.assertEqual(self.decide()['status'], 'selected')
        self.state['spent_usd'] = 0.05
        self.assertBlocked()

    def test_unknown_cost_bound_does_not_become_zero(self):
        self.catalog['models'] = self.catalog['models'][:1]
        self.catalog['models'][0].update(billing='metered', upper_bound_usd=None, spend_cap_enforced=True)
        self.profile['max_paid_usd'] = self.task['max_paid_usd'] = 1
        self.task['paid_authorized'] = True
        self.assertBlocked()

    def test_advisory_token_request_is_not_a_paid_spend_enforcer(self):
        self.catalog['models'] = self.catalog['models'][:1]
        self.catalog['models'][0].update(billing='metered', upper_bound_usd=0.01)
        self.profile['max_paid_usd'] = self.task['max_paid_usd'] = 1
        self.task['paid_authorized'] = True
        self.assertBlocked()

    def test_stale_account_snapshot_blocks_dispatch(self):
        self.state['observed_at'] = '2026-11-20T00:00:00Z'
        self.assertBlocked()

    def test_missing_modality_is_not_inferred_from_rank(self):
        self.task['input_modalities'] = ['text', 'image']
        self.assertBlocked()
        self.catalog['models'][1]['inputs'].append('image')
        self.assertEqual(self.decide()['dispatch_fields']['target']['model'], 'strong')

    def test_worker_attempt_and_requested_token_budgets(self):
        for field, value in [('workers', 3), ('attempts', 2), ('requested_tokens', 20000)]:
            self.setUp()
            if field == 'workers':
                self.state['attempts'] = 3
                self.profile['max_attempts'] = 5
            old = self.state[field]
            self.state[field] = value
            self.assertBlocked()
            self.state[field] = old

    def test_missing_account_state_is_not_an_empty_pool(self):
        self.state['accounts'] = {}
        self.assertBlocked()

    def test_stale_catalog_and_stale_role_evidence(self):
        self.catalog['observed_at'] = '2026-10-01T00:00:00Z'
        self.assertBlocked()
        self.catalog['observed_at'] = NOW
        for m in self.catalog['models']:
            for evidence in m['evidence']:
                evidence['observed_at'] = '2026-10-01T00:00:00Z'
        self.assertBlocked()

    def test_evidence_for_another_role_is_not_code_validation(self):
        self.task['role'] = 'code'
        for m in self.catalog['models']:
            m['evidence'] = [record for record in m['evidence'] if record['role'] == 'extract']
        self.assertBlocked()

    def test_acceptance_check_is_required_for_delegation(self):
        self.task['acceptance'] = []
        self.assertBlocked()

    def test_context_and_output_limits_are_checked(self):
        self.profile['max_requested_tokens'] = 100000
        self.task['input_tokens'] = 32768
        self.assertBlocked()
        self.task['input_tokens'] = 512
        self.task['output_tokens'] = 5000
        self.assertBlocked()

    def test_separate_input_limit_is_checked(self):
        for m in self.catalog['models']:
            m['input_tokens_limit'] = 128
        self.assertBlocked()

    def test_evidence_for_low_does_not_validate_high(self):
        self.task['pin'] = {'provider_instance': 'free', 'model': 'small',
                            'options': {'variant': 'high'}}
        self.assertBlocked()

    def test_unavailable_tools_do_not_satisfy_tool_job(self):
        self.task['requires_tools'] = True
        for m in self.catalog['models']:
            m['tools'] = False
        self.assertBlocked()

    def test_disabled_model_is_excluded(self):
        for m in self.catalog['models']:
            m['enabled'] = False
        self.assertBlocked()

    def test_invalid_input_types_fail_closed(self):
        for field, value in [('input_tokens', True), ('max_paid_usd', float('nan')),
                             ('requires_sudo', 'false')]:
            task = copy.deepcopy(self.task)
            task[field] = value
            with self.assertRaises(ValueError):
                route.select(self.catalog, self.profile, task, self.state, now=NOW)

    def test_catalog_duplicate_route_is_rejected(self):
        self.catalog['models'].append(copy.deepcopy(self.catalog['models'][0]))
        with self.assertRaises(ValueError):
            self.decide()

    def test_json_duplicate_keys_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'duplicate.json'
            p.write_text('{"schema_version":1,"schema_version":2}')
            with self.assertRaises(ValueError):
                route.load_json(p)

    def test_failed_route_advances_without_falsifying_account_throttle(self):
        self.state['attempts'] = 1
        self.state['failed_routes'] = [self.profile['role_preferences']['extract'][0]]
        self.assertEqual(self.decide()['dispatch_fields']['target']['model'], 'strong')
        self.task['pin'] = self.state['failed_routes'][0]
        self.assertBlocked()

    def test_discovery_cannot_grant_private_permission(self):
        self.task['data_class'] = 'private'
        for m in self.catalog['models']:
            m['data_classes'].append('private')
        self.assertBlocked()

    def test_unknown_locality_is_not_a_private_destination(self):
        for m in self.catalog['models']:
            m['locality'] = 'unknown'
        self.assertBlocked()

    def test_host_constraint_requires_bound_execution_environment(self):
        self.task['required_host'] = 'host-a'
        for m in self.catalog['models']:
            m.update(locality='local', host='host-a')
        self.assertBlocked()
        self.catalog['models'][0]['environment_id'] = 'env-a'
        self.assertEqual(self.decide()['dispatch_fields']['target']['environmentId'], 'env-a')

    def test_role_levels_and_dates_are_independent(self):
        self.task['role'] = 'code'
        self.task['min_evidence'] = 'role-validated'
        for m in self.catalog['models']:
            for record in m['evidence']:
                if record['role'] == 'extract':
                    record['level'] = 'role-validated'
        self.assertBlocked()

    def test_typoed_constraints_and_unknown_fields_fail_closed(self):
        for remove, typo, value in [('required_host', 'requiredHost', 'host-a'),
                                     ('pin', 'pinned', {'provider_instance': 'free', 'model': 'small'})]:
            task = copy.deepcopy(self.task)
            task.pop(remove)
            task[typo] = value
            with self.assertRaises(ValueError):
                route.select(self.catalog, self.profile, task, self.state, now=NOW)

    def test_zero_estimates_and_invalid_now_fail_closed(self):
        for field in ('input_tokens', 'output_tokens'):
            task = copy.deepcopy(self.task)
            task[field] = 0
            with self.assertRaises(ValueError):
                route.select(self.catalog, self.profile, task, self.state, now=NOW)
        with self.assertRaises(ValueError):
            route.select(self.catalog, self.profile, self.task, self.state, now='')

    def test_stale_individual_account_is_not_refreshed_by_other_account(self):
        self.state['accounts']['free-account']['observed_at'] = '2026-11-20T00:00:00Z'
        self.assertEqual(self.decide()['dispatch_fields']['target']['model'], 'strong')

    def test_invalid_state_and_absurd_freshness_are_rejected(self):
        self.state['workers'] = 1
        with self.assertRaises(ValueError):
            self.decide()
        self.state['workers'] = 0
        self.profile['catalog_max_age_hours'] = 1e308
        with self.assertRaises(ValueError):
            self.decide()

    def test_metered_bounds_are_positive_and_decimal_safe(self):
        self.catalog['models'] = self.catalog['models'][:1]
        m = self.catalog['models'][0]
        m.update(billing='metered', upper_bound_usd=0, spend_cap_enforced=True)
        self.profile['max_paid_usd'] = self.task['max_paid_usd'] = 0.3
        self.task['paid_authorized'] = True
        self.assertBlocked()
        m['upper_bound_usd'] = 0.2
        self.state['spent_usd'] = 0.1
        result = self.decide()
        self.assertEqual(result['status'], 'selected')
        self.assertEqual(result['reserved_usd'], 0.2)
        self.assertEqual(result['billing'], 'metered')

    def test_future_and_naive_observations_are_not_fresh(self):
        self.catalog['observed_at'] = '2026-11-22T00:00:00Z'
        self.assertBlocked()
        self.catalog['observed_at'] = '2026-11-21T12:00:00'
        with self.assertRaises(ValueError):
            self.decide()

    def run_cli(self, extra_now=None, invalid_catalog=None):
        with tempfile.TemporaryDirectory() as tmp:
            args = [sys.executable, '-B', str(SCRIPT)]
            for name in ('catalog', 'profile', 'task', 'state'):
                path = Path(tmp) / (name + '.json')
                path.write_text(json.dumps(getattr(self, name)))
                if name == 'catalog' and invalid_catalog is not None:
                    path.write_text(invalid_catalog)
                args += ['--' + name, str(path)]
            args += ['--now', NOW if extra_now is None else extra_now]
            result = subprocess.run(args, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.stderr, '')
            return result.returncode, json.loads(result.stdout)

    def test_cli_selected_and_parent_exits(self):
        code, result = self.run_cli()
        self.assertEqual((code, result['status']), (0, 'selected'))
        self.assertEqual(result['dispatch_fields']['target']['providerInstanceId'], 'free')
        self.task['kind'] = 'quick'
        code, result = self.run_cli()
        self.assertEqual((code, result['status']), (0, 'parent'))

    def test_cli_blocked_exit_and_empty_clock_error(self):
        self.profile['max_workers'] = 0
        code, result = self.run_cli()
        self.assertEqual((code, result['status']), (3, 'blocked'))
        code, result = self.run_cli(extra_now='')
        self.assertEqual((code, result['status']), (2, 'invalid'))

    def test_cli_rejects_duplicate_nonfinite_and_unknown_fields(self):
        for raw in ('{"schema_version":1,"schema_version":2}', '{"value":NaN}', '{"value":Infinity}',
                    '{"value":1e9999999999999999999}'):
            code, result = self.run_cli(invalid_catalog=raw)
            self.assertEqual((code, result['status']), (2, 'invalid'))
        self.task['arbitrary_command'] = 'not executed'
        code, result = self.run_cli()
        self.assertEqual((code, result['status']), (2, 'invalid'))

    def test_currency_values_have_bounded_precision_and_range(self):
        for value in (10**28, 0.0000001):
            self.task['max_paid_usd'] = value
            with self.assertRaises(ValueError):
                self.decide()

    def test_cli_does_not_round_paid_bound_before_validation(self):
        self.catalog['models'] = self.catalog['models'][:1]
        self.catalog['models'][0].update(billing='metered', upper_bound_usd=0.3, spend_cap_enforced=True)
        self.profile['max_paid_usd'] = self.task['max_paid_usd'] = 0.3
        self.task['paid_authorized'] = True
        raw = json.dumps(self.catalog).replace('"upper_bound_usd": 0.3', '"upper_bound_usd": 0.30000000000000001')
        code, result = self.run_cli(invalid_catalog=raw)
        self.assertEqual((code, result['status']), (2, 'invalid'))

    def test_selected_pack_copies_and_runs_without_sibling_skills(self):
        with tempfile.TemporaryDirectory() as tmp:
            installed = Path(tmp) / 'model-routing'
            shutil.copytree(SCRIPT.parents[1], installed, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
            for doc in installed.rglob('*.md'):
                for href in re.findall(r'\]\(([^)]+)\)', doc.read_text()):
                    target = href.split('#')[0]
                    if not target or re.match(r'^[a-z]+:', target, re.I):
                        continue
                    resolved = (doc.parent / target).resolve()
                    self.assertTrue(resolved.is_relative_to(installed), target)
                    self.assertTrue(resolved.is_file(), target)
            args = [sys.executable, '-B', str(installed / 'scripts/route.py')]
            for name in ('catalog', 'profile', 'task', 'state'):
                args += ['--' + name, str(installed / 'examples' / (name + '.json'))]
            args += ['--now', NOW]
            result = subprocess.run(args, capture_output=True, text=True, cwd=tmp, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['status'], 'selected')

    def test_role_maps_to_typed_t3_delegate_roles(self):
        for role, expected in [('code', 'implementation'), ('review', 'review'),
                               ('research', 'research'), ('plan', 'design'),
                               ('test', 'test'), ('extract', 'general')]:
            self.setUp()
            self.profile['role_preferences'][role] = [{'provider_instance': 'plan', 'model': 'strong'}]
            self.catalog['models'][1]['evidence'].append(
                {'level': 'smoke', 'observed_at': NOW, 'role': role, 'options': {}})
            self.task['role'] = role
            result = self.decide()
            self.assertEqual(result['status'], 'selected', role)
            self.assertEqual(result['dispatch_fields']['role'], expected)

    def test_unknown_output_limit_allowed_for_non_metered_blocked_for_metered(self):
        self.catalog['models'][1]['output_tokens'] = None
        self.task['role'] = 'code'
        result = self.decide()
        self.assertEqual(result['status'], 'selected')
        self.assertTrue(result['output_limit_unverified'])
        # Metered route with unknown output_tokens must still block
        self.catalog['models'] = [self.catalog['models'][1]]
        self.catalog['models'][0].update(billing='metered', upper_bound_usd=0.05, spend_cap_enforced=True)
        self.profile['max_paid_usd'] = self.task['max_paid_usd'] = 0.5
        self.task['paid_authorized'] = True
        self.assertBlocked()

    def test_cli_inline_role_and_fresh_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            cat_p = Path(tmp) / 'catalog.json'
            prof_p = Path(tmp) / 'profile.json'
            cat_p.write_text(json.dumps(self.catalog))
            prof_p.write_text(json.dumps(self.profile))
            args = [sys.executable, '-B', str(SCRIPT),
                    '--catalog', str(cat_p), '--profile', str(prof_p),
                    '--role', 'code', '--data-class', 'public',
                    '--acceptance', 'Unit tests pass', '--fresh-state', '--now', NOW]
            res = subprocess.run(args, capture_output=True, text=True, timeout=10)
            self.assertEqual(res.returncode, 0, res.stderr)
            out = json.loads(res.stdout)
            self.assertEqual(out['status'], 'selected')
            self.assertEqual(out['dispatch_fields']['target']['model'], 'strong')
            self.assertEqual(out['dispatch_fields']['role'], 'implementation')
            # Excluding failed route falls back to next eligible route (including routes with options)
            res2 = subprocess.run(args + ['--failed', 'plan:strong'], capture_output=True, text=True, timeout=10)
            self.assertEqual(res2.returncode, 0, res2.stderr)
            self.assertEqual(json.loads(res2.stdout)['dispatch_fields']['target']['model'], 'small')
            # Excluding failed route without options matches a preferred route that has options
            ext_args = [sys.executable, '-B', str(SCRIPT),
                        '--catalog', str(cat_p), '--profile', str(prof_p),
                        '--role', 'extract', '--data-class', 'public',
                        '--acceptance', 'Check fixture', '--fresh-state', '--now', NOW,
                        '--failed', 'free:small']
            res_opt = subprocess.run(ext_args, capture_output=True, text=True, timeout=10)
            self.assertEqual(res_opt.returncode, 0, res_opt.stderr)
            self.assertEqual(json.loads(res_opt.stdout)['dispatch_fields']['target']['model'], 'strong')
            # Passing both --task and --role fails closed with exit 2
            task_p = Path(tmp) / 'task.json'
            task_p.write_text(json.dumps(self.task))
            res3 = subprocess.run(args + ['--task', str(task_p)], capture_output=True, text=True, timeout=10)
            self.assertEqual(res3.returncode, 2)


if __name__ == '__main__':
    unittest.main()
