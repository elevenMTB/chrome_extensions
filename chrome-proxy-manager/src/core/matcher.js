import { proxyToPac } from "./pac.js";

export function parseHost(input) {
  const value = String(input || "").trim();

  if (!value) {
    return "";
  }

  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.toLowerCase();
  } catch {
    return value.split("/")[0].split(":")[0].toLowerCase();
  }
}

export function findMatchingRule(config, input) {
  const host = parseHost(input);
  const orderedRules = config.rules
    .filter((rule) => rule.enabled && rule.pattern)
    .sort((left, right) => left.priority - right.priority);

  for (const rule of orderedRules) {
    const pattern = rule.pattern.toLowerCase();
    if (matchesRule(host, pattern, rule.type)) {
      const proxy = config.proxies.find((item) => item.id === rule.proxyId && item.enabled);
      return {
        host,
        rule,
        proxy: proxy || null,
        pac: proxy ? proxyToPac(proxy) : "DIRECT"
      };
    }
  }

  return {
    host,
    rule: null,
    proxy: null,
    pac: "DIRECT"
  };
}

export function matchesRule(host, pattern, type) {
  if (!host || !pattern) {
    return false;
  }

  if (type === "exact") {
    return host === pattern;
  }

  if (type === "wildcard") {
    return wildcardToRegExp(pattern).test(host);
  }

  if (type === "keyword") {
    return host.includes(pattern);
  }

  return false;
}

function wildcardToRegExp(pattern) {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${escaped}$`);
}
