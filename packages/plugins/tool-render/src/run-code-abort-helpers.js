
// dotfiles-ai#152 helpers — BEGIN
function dotfilesAiAbortMessage(reason) {
	try {
		if (typeof reason === "string") return reason;
		if (reason instanceof Error) return reason.message;
		if (reason !== null && typeof reason === "object") {
			var parts = [];
			var kind = typeof reason.kind === "string" ? reason.kind : "";
			var why = typeof reason.reason === "string" ? reason.reason : "";
			if (why === "approval-rejected") {
				parts.push(
					(kind !== "" ? kind + " " : "") +
						"rejected the approval request (a human refusal, not a crash \u2014 do not retry the refused action)",
				);
			} else if (why === "approval-cancelled") {
				parts.push((kind !== "" ? kind + " " : "") + "cancelled the approval request");
			} else if (why !== "") {
				parts.push(kind !== "" ? kind + " abort (" + why + ")" : "abort (" + why + ")");
			}
			// Preserve every other human-authored string field (a rejection
			// comment, a detail), so it survives into the message the model
			// sees instead of being dropped with the object wrapper.
			var keys = Object.keys(reason);
			for (var i = 0; i < keys.length; i++) {
				var key = keys[i];
				if (key === "kind" || key === "reason") continue;
				var value = reason[key];
				if (typeof value === "string" && value !== "") parts.push(key + ": " + value);
			}
			if (parts.length > 0) return parts.join("; ");
			var json = JSON.stringify(reason);
			if (typeof json === "string" && json !== "") return json;
		}
		var text = String(reason);
		if (text !== "[object Object]") return text;
		if (reason !== null && typeof reason === "object") {
			var names = Object.keys(reason).slice(0, 8).join(", ");
			if (names !== "") return "abort reason {" + names + "}";
		}
		return "abort (unprintable reason)";
	} catch (e) {
		return "abort (unprintable reason)";
	}
}
function dotfilesAiErrorText(message) {
	try {
		if (typeof message === "string") return message;
		if (message instanceof Error) return message.message;
		if (message !== null && typeof message === "object") {
			var json = JSON.stringify(message);
			if (typeof json === "string" && json !== "") return json;
		}
		var text = String(message);
		if (text !== "[object Object]") return text;
		return "<unprintable error message>";
	} catch (e) {
		return "<unprintable error message>";
	}
}
// dotfiles-ai#152 helpers — END
