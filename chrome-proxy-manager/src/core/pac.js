import { RULE_TYPES } from "./config.js";

export function proxyToPac(proxy) {
  if (!proxy?.enabled) {
    return "DIRECT";
  }

  const host = String(proxy.host || "").trim();
  const port = Number(proxy.port);

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return "DIRECT";
  }

  const prefixByType = {
    http: "PROXY",
    https: "HTTPS",
    socks5: "SOCKS5"
  };

  const prefix = prefixByType[proxy.type] || "PROXY";
  return `${prefix} ${host}:${port}`;
}

export function generatePacScript(config) {
  const enabledProxies = new Map(
    config.proxies.filter((proxy) => proxy.enabled).map((proxy) => [proxy.id, proxy])
  );
  const orderedRules = config.rules
    .filter((rule) => rule.enabled && rule.pattern && RULE_TYPES.includes(rule.type))
    .sort((left, right) => left.priority - right.priority);

  const lines = [
    "function FindProxyForURL(url, host) {",
    "  host = String(host || '').toLowerCase();"
  ];

  for (const rule of orderedRules) {
    const proxy = enabledProxies.get(rule.proxyId);
    if (!proxy) {
      continue;
    }

    const pattern = String(rule.pattern).trim().toLowerCase();
    const proxyValue = proxyToPac(proxy);

    if (!pattern || proxyValue === "DIRECT") {
      continue;
    }

    if (rule.type === "exact") {
      lines.push(`  if (host === ${jsString(pattern)}) {`);
      lines.push(`    return ${jsString(proxyValue)};`);
      lines.push("  }");
      continue;
    }

    if (rule.type === "wildcard") {
      lines.push(`  if (shExpMatch(host, ${jsString(pattern)})) {`);
      lines.push(`    return ${jsString(proxyValue)};`);
      lines.push("  }");
      continue;
    }

    if (rule.type === "keyword") {
      lines.push(`  if (host.indexOf(${jsString(pattern)}) !== -1) {`);
      lines.push(`    return ${jsString(proxyValue)};`);
      lines.push("  }");
      lines.push("");
    }
  }

  lines.push("  return 'DIRECT';");
  lines.push("}");

  return lines.join("\n");
}

function jsString(value) {
  return JSON.stringify(String(value));
}
