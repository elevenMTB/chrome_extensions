export function safeParseUrl(urlString) {
  if (typeof urlString !== "string" || !urlString) {
    return null;
  }

  try {
    return new URL(urlString);
  } catch {
    return null;
  }
}

export function isProcessableUrl(urlString) {
  if (typeof urlString !== "string" || !urlString) {
    return false;
  }

  const lower = urlString.trim().toLowerCase();
  if (!lower || lower === "about:blank") {
    return false;
  }

  if (
    lower.startsWith("chrome://") ||
    lower.startsWith("chrome-extension://") ||
    lower.startsWith("devtools://") ||
    lower.startsWith("view-source:") ||
    lower.startsWith("file://")
  ) {
    return false;
  }

  const parsed = safeParseUrl(urlString);
  if (!parsed) {
    return false;
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

export function hostnameMatchesRule(hostname, rule) {
  if (!hostname || !rule) {
    return false;
  }

  if (rule.startsWith("*.")) {
    const suffix = rule.slice(2);
    return hostname.endsWith(`.${suffix}`);
  }

  return hostname === rule;
}

export function matchesRuleList(urlString, rules = []) {
  const parsed = safeParseUrl(urlString);
  if (!parsed) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return rules.some((rule) => hostnameMatchesRule(hostname, rule));
}

export function isBlacklistedUrl(urlString, blacklistRules = []) {
  return matchesRuleList(urlString, blacklistRules);
}

export function isWhitelistedUrl(urlString, whitelistRules = []) {
  return matchesRuleList(urlString, whitelistRules);
}

export function shouldSkipAutoHandling(urlString, settings) {
  if (!isProcessableUrl(urlString)) {
    return {
      skip: true,
      reason: "unprocessable_url",
    };
  }

  if (isWhitelistedUrl(urlString, settings.whitelist)) {
    return {
      skip: true,
      reason: "whitelisted",
    };
  }

  if (isBlacklistedUrl(urlString, settings.blacklist)) {
    return {
      skip: true,
      reason: "blacklisted",
    };
  }

  return {
    skip: false,
    reason: null,
  };
}
