(function initOptions(global) {
  const TGH = global.TGH;
  let state = null;
  let selectedRuleId = null;

  const $ = (id) => document.getElementById(id);

  function setStatus(message, isError) {
    $('status').textContent = message || '';
    $('status').style.color = isError ? '#d33f49' : '#677089';
  }

  function sendMessage(type, payload) {
    return chrome.runtime.sendMessage({ type, payload }).then((response) => {
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error.message : '操作失败');
      }
      return response.data;
    });
  }

  function selectedRule() {
    return state.rules.find((rule) => rule.id === selectedRuleId) || state.rules[0] || null;
  }

  function renderSettings() {
    const settings = state.settings;
    $('autoGroupEnabled').checked = settings.autoGroupEnabled;
    $('runOnStartup').checked = settings.runOnStartup;
    $('includePinnedTabs').checked = settings.includePinnedTabs;
    $('sameNameGroupPolicy').value = settings.sameNameGroupPolicy;
    $('historyTabPolicy').value = settings.historyTabPolicy;
    $('manualOrganizeDefaultScope').value = settings.manualOrganizeDefaultScope;
  }

  function conditionSummary(rule) {
    return rule.conditions
      .map((condition) => `${condition.target} ${condition.operator} ${condition.value}`)
      .join(' 或 ');
  }

  function renderRules() {
    const list = $('rulesList');
    list.innerHTML = '';

    const rules = [...state.rules].sort((a, b) => a.priority - b.priority);
    for (const [index, rule] of rules.entries()) {
      const item = document.createElement('div');
      item.className = `rule-item${rule.id === selectedRuleId ? ' active' : ''}`;
      item.innerHTML = `
        <strong>${escapeHtml(rule.ruleName)} → ${escapeHtml(rule.groupName)}</strong>
        <span class="rule-meta">${rule.enabled ? '启用' : '禁用'} · 第 ${index + 1} 位 · 优先级 ${rule.priority} · ${escapeHtml(conditionSummary(rule))}</span>
        <span class="rule-meta">${rule.colorMode === 'fixed' ? `固定颜色 ${rule.fixedColor}` : '随机颜色'}</span>
        <span class="rule-actions">
          <button type="button" data-action="up">上移</button>
          <button type="button" data-action="down">下移</button>
          <label class="priority-jump">
            <span>移动到第</span>
            <input type="number" data-action="position" min="1" max="${rules.length}" value="${index + 1}">
            <span>位</span>
          </label>
          <button type="button" data-action="jump">移动</button>
        </span>
      `;
      item.addEventListener('click', () => {
        selectedRuleId = rule.id;
        renderRules();
        renderEditor();
      });
      item.querySelector('[data-action="up"]').addEventListener('click', (event) => {
        event.stopPropagation();
        moveRule(rule.id, -1);
      });
      item.querySelector('[data-action="down"]').addEventListener('click', (event) => {
        event.stopPropagation();
        moveRule(rule.id, 1);
      });
      item.querySelector('[data-action="position"]').addEventListener('click', (event) => {
        event.stopPropagation();
      });
      item.querySelector('[data-action="position"]').addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          moveRuleToPosition(rule.id, event.currentTarget.value);
        }
      });
      item.querySelector('[data-action="jump"]').addEventListener('click', (event) => {
        event.stopPropagation();
        const positionInput = item.querySelector('[data-action="position"]');
        moveRuleToPosition(rule.id, positionInput.value);
      });
      list.appendChild(item);
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function createConditionRow(condition) {
    const row = document.createElement('div');
    row.className = 'condition-row';
    row.innerHTML = `
      <select data-field="target">
        <option value="hostname">域名</option>
        <option value="url">完整 URL</option>
        <option value="title">网页标题</option>
      </select>
      <select data-field="operator">
        <option value="contains">包含</option>
        <option value="startsWith">前缀</option>
        <option value="endsWith">后缀</option>
        <option value="equals">完全相等</option>
      </select>
      <input data-field="value" placeholder="关键字">
      <button type="button" data-action="remove">删除</button>
    `;
    row.querySelector('[data-field="target"]').value = condition.target || 'url';
    row.querySelector('[data-field="operator"]').value = condition.operator || 'contains';
    row.querySelector('[data-field="value"]').value = condition.value || '';
    row.querySelector('[data-action="remove"]').addEventListener('click', () => row.remove());
    return row;
  }

  function renderEditor() {
    const rule = selectedRule();
    if (!rule) {
      $('ruleForm').reset();
      $('conditions').innerHTML = '';
      return;
    }

    selectedRuleId = rule.id;
    $('ruleId').value = rule.id;
    $('ruleName').value = rule.ruleName;
    $('groupName').value = rule.groupName;
    $('enabled').checked = rule.enabled;
    $('colorMode').value = rule.colorMode;
    $('fixedColor').value = rule.fixedColor;
    $('conditions').innerHTML = '';
    rule.conditions.forEach((condition) => $('conditions').appendChild(createConditionRow(condition)));
  }

  function readSettings() {
    return {
      autoGroupEnabled: $('autoGroupEnabled').checked,
      runOnStartup: $('runOnStartup').checked,
      includePinnedTabs: $('includePinnedTabs').checked,
      sameNameGroupPolicy: $('sameNameGroupPolicy').value,
      historyTabPolicy: $('historyTabPolicy').value,
      manualOrganizeDefaultScope: $('manualOrganizeDefaultScope').value
    };
  }

  function readConditions() {
    return [...$('conditions').querySelectorAll('.condition-row')]
      .map((row, index) => ({
        id: `condition-${index + 1}`,
        target: row.querySelector('[data-field="target"]').value,
        operator: row.querySelector('[data-field="operator"]').value,
        value: row.querySelector('[data-field="value"]').value.trim()
      }))
      .filter((condition) => condition.value);
  }

  function readRuleFromForm() {
    const conditions = readConditions();
    if (!conditions.length) {
      throw new Error('至少需要一条匹配条件。');
    }

    const existing = selectedRule() || {};
    return {
      id: $('ruleId').value || TGH.Storage.generateId('rule'),
      enabled: $('enabled').checked,
      priority: existing.priority || (state.rules.length + 1) * 10,
      ruleName: $('ruleName').value.trim(),
      groupName: $('groupName').value.trim(),
      colorMode: $('colorMode').value,
      fixedColor: $('fixedColor').value,
      matchMode: 'OR',
      conditions,
      createdAt: existing.createdAt || Date.now(),
      updatedAt: Date.now()
    };
  }

  function applyRuleToList(event) {
    event.preventDefault();
    try {
      const rule = readRuleFromForm();
      if (!rule.ruleName || !rule.groupName) {
        throw new Error('规则名称和分组名称不能为空。');
      }
      const index = state.rules.findIndex((item) => item.id === rule.id);
      if (index >= 0) {
        state.rules[index] = rule;
      } else {
        state.rules.push(rule);
      }
      selectedRuleId = rule.id;
      renderRules();
      renderEditor();
      setStatus('已应用到列表，点击“保存配置”后生效。');
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function newRule() {
    const rule = {
      id: TGH.Storage.generateId('rule'),
      enabled: true,
      priority: (state.rules.length + 1) * 10,
      ruleName: '新规则',
      groupName: '新分组',
      colorMode: 'random',
      fixedColor: 'blue',
      matchMode: 'OR',
      conditions: [{ id: 'condition-1', target: 'url', operator: 'contains', value: '' }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    state.rules.push(rule);
    selectedRuleId = rule.id;
    renderRules();
    renderEditor();
  }

  function moveRule(ruleId, direction) {
    const rules = [...state.rules].sort((a, b) => a.priority - b.priority);
    const index = rules.findIndex((rule) => rule.id === ruleId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= rules.length) {
      return;
    }
    const [rule] = rules.splice(index, 1);
    rules.splice(targetIndex, 0, rule);
    state.rules = rules.map((item, itemIndex) => ({
      ...item,
      priority: (itemIndex + 1) * 10
    }));
    selectedRuleId = ruleId;
    renderRules();
    renderEditor();
    setStatus('规则优先级已调整，点击“保存配置”后生效。');
  }

  function moveRuleToPosition(ruleId, positionValue) {
    const rules = [...state.rules].sort((a, b) => a.priority - b.priority);
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) {
      return;
    }

    const targetPosition = Number.parseInt(positionValue, 10);
    if (!Number.isInteger(targetPosition) || targetPosition < 1 || targetPosition > rules.length) {
      setStatus(`请输入 1 到 ${rules.length} 之间的位置。`, true);
      return;
    }

    const targetIndex = targetPosition - 1;
    if (targetIndex === index) {
      setStatus('规则已经在目标位置。');
      return;
    }

    const [rule] = rules.splice(index, 1);
    rules.splice(targetIndex, 0, rule);
    state.rules = rules.map((item, itemIndex) => ({
      ...item,
      priority: (itemIndex + 1) * 10
    }));
    selectedRuleId = ruleId;
    renderRules();
    renderEditor();
    setStatus(`已移动到第 ${targetPosition} 位，点击“保存配置”后生效。`);
  }

  function deleteRule() {
    if (!selectedRuleId) {
      return;
    }
    state.rules = state.rules.filter((rule) => rule.id !== selectedRuleId);
    selectedRuleId = state.rules[0] ? state.rules[0].id : null;
    renderRules();
    renderEditor();
    setStatus('已从列表删除，点击“保存配置”后生效。');
  }

  async function saveAll() {
    const rules = state.rules.map((rule, index) => ({ ...rule, priority: (index + 1) * 10 }));
    state = await sendMessage(TGH.MESSAGE_TYPES.SAVE_OPTIONS, {
      rules,
      settings: readSettings()
    });
    selectedRuleId = selectedRuleId || (state.rules[0] && state.rules[0].id);
    renderSettings();
    renderRules();
    renderEditor();
    setStatus('配置已保存。');
  }

  async function exportJson() {
    const data = await sendMessage(TGH.MESSAGE_TYPES.EXPORT_RULES);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tab-group-helper-rules-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('规则 JSON 已导出。');
  }

  async function importJson(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const content = await file.text();
      state = await sendMessage(TGH.MESSAGE_TYPES.IMPORT_RULES, { content });
      selectedRuleId = state.rules[0] ? state.rules[0].id : null;
      renderSettings();
      renderRules();
      renderEditor();
      setStatus(`已导入 ${state.rules.length} 条规则。`);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      event.target.value = '';
    }
  }

  async function init() {
    state = await sendMessage(TGH.MESSAGE_TYPES.GET_STORAGE_STATE);
    selectedRuleId = state.rules[0] ? state.rules[0].id : null;
    renderSettings();
    renderRules();
    renderEditor();
    $('ruleForm').addEventListener('submit', applyRuleToList);
    $('newRule').addEventListener('click', newRule);
    $('deleteRule').addEventListener('click', deleteRule);
    $('addCondition').addEventListener('click', () => {
      $('conditions').appendChild(createConditionRow({ target: 'url', operator: 'contains', value: '' }));
    });
    $('saveAll').addEventListener('click', () => saveAll().catch((error) => setStatus(error.message, true)));
    $('exportJson').addEventListener('click', () => exportJson().catch((error) => setStatus(error.message, true)));
    $('importFile').addEventListener('change', importJson);
  }

  init().catch((error) => setStatus(error.message, true));
})(globalThis);
