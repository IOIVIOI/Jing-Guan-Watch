(function () {
  'use strict';

  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
  var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
  var HEALTH = window.HEALTH_DATA;

  var DEFAULT_SETTINGS = {
    enabled: true,
    categories: {
      '运动': true,
      '睡眠': true,
      '心率健康': true,
      '用药提醒': true,
      '社交': true
    },
    frequency: 3,
    quietStart: '22:00',
    quietEnd: '07:00'
  };

  var DEFAULT_REMINDERS = {
    sedentary: false,
    water: false,
    sleepRelax: false,
    heartHigh: false,
    medication: false,
    social: false
  };

  var REMINDERS = {
    sedentary: {
      glyph: '行',
      title: '久坐提醒',
      detail: '每坐满一小时，提醒起身活动三分钟。'
    },
    water: {
      glyph: '水',
      title: '饮水提醒',
      detail: '每两小时提醒补充水分。'
    },
    sleepRelax: {
      glyph: '松',
      title: '睡前放松',
      detail: '每晚21:00提醒进行10分钟放松。'
    },
    heartHigh: {
      glyph: '脉',
      title: '心率偏高',
      detail: '连续偏高时，提醒留意并记录感受。'
    },
    medication: {
      glyph: '药',
      title: '用药提醒',
      detail: '每天早八点，提醒按时服药。'
    },
    social: {
      glyph: '聚',
      title: '社交提醒',
      detail: '每周三下午提醒与朋友散步。'
    }
  };

  var METRICS = {
    sleep: {
      label: '睡眠时长',
      value: '6.2',
      unit: '小时',
      key: 'sleep',
      insight: '近7天平均睡眠略少，建议保持规律作息。',
      detail: '近7天平均睡眠 6.2 小时，较上周少 0.8 小时。深睡比例有所下降。',
      toast: '已展开近七日睡眠'
    },
    deep: {
      label: '深睡比例',
      value: '15',
      unit: '%',
      key: 'deep',
      insight: '近7天深睡比例偏低，建议减少睡前咖啡因摄入。',
      detail: '近7天深睡比例平均 15%，较上周下降 4 个百分点。',
      toast: '已展开近七日深睡'
    },
    heart: {
      label: '夜间静息心率',
      value: '68',
      unit: '次/分',
      key: 'nightHR',
      insight: '夜间心率略高，建议留意当天活动量和咖啡因摄入。',
      detail: '近7天夜间静息心率平均 68 次/分，较上周高 6 次/分。',
      toast: '已展开近七日心率'
    },
    steps: {
      label: '每日步数',
      value: '6,842',
      unit: '步',
      key: 'steps',
      insight: '今日步数目标已完成86%，下午可适当活动。',
      detail: '近7天平均每日约 6,060 步，今日目标已完成 86%，午后久坐时间较长。',
      toast: '已展开近七日步数'
    },
    active: {
      label: '活跃时长',
      value: '42',
      unit: '分钟',
      key: 'active',
      insight: '今日已活动42分钟，可继续保持。',
      detail: '今日活跃 42 分钟，近7天平均约 35 分钟，下午可再活动10分钟。',
      toast: '已展开近七日活跃时长'
    }
  };

  var state = {
    screen: 'home',
    metric: 'sleep',
    range: 7,
    settings: loadSettings(),
    reminders: loadReminders(),
    listening: false,
    processing: false,
    recognition: null,
    finalTranscript: '',
    toastTimer: null,
    replyTimer: null
  };

  var screen = $('#screen');
  var voiceKey = $('#voiceKey');
  var assistantLayer = $('#assistantLayer');
  var assistantStage = $('#assistantStage');
  var assistantTitle = $('#assistantTitle');
  var assistantSubtitle = $('#assistantSubtitle');
  var commandSheet = $('#commandSheet');
  var voiceForm = $('#voiceForm');
  var voiceCommand = $('#voiceCommand');
  var screenToast = $('#screenToast');
  var executionRipple = $('#executionRipple');
  var accessibleStatus = $('#accessibleStatus');

  function loadSettings() {
    try {
      var raw = localStorage.getItem('zenWatchSettings');
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          enabled: parsed.enabled !== undefined ? parsed.enabled : DEFAULT_SETTINGS.enabled,
          categories: Object.assign({}, DEFAULT_SETTINGS.categories, parsed.categories || {}),
          frequency: parsed.frequency || DEFAULT_SETTINGS.frequency,
          quietStart: parsed.quietStart || DEFAULT_SETTINGS.quietStart,
          quietEnd: parsed.quietEnd || DEFAULT_SETTINGS.quietEnd
        };
      }
    } catch (error) {}
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function saveSettings() {
    try {
      localStorage.setItem('zenWatchSettings', JSON.stringify(state.settings));
    } catch (error) {}
  }

  function loadReminders() {
    try {
      var raw = localStorage.getItem('zenWatchReminders');
      if (raw) return Object.assign({}, DEFAULT_REMINDERS, JSON.parse(raw));
    } catch (error) {}
    return JSON.parse(JSON.stringify(DEFAULT_REMINDERS));
  }

  function saveReminders() {
    try {
      localStorage.setItem('zenWatchReminders', JSON.stringify(state.reminders));
    } catch (error) {}
  }

  function showScreen(name) {
    state.screen = name;
    screen.setAttribute('data-mode', name);
    $$('.app-screen').forEach(function (view) {
      var active = view.getAttribute('data-screen') === name;
      view.hidden = !active;
      view.classList.toggle('is-active', active);
    });
    if (name === 'health') renderHealth();
    if (name === 'settings') renderSettings();
    if (name === 'reminders') renderReminders();
    accessibleStatus.textContent = '已打开' + screenName(name);
  }

  function screenName(name) {
    return {
      home: '主界面',
      health: '健康数据',
      settings: '推荐设置',
      reminders: '我的提醒'
    }[name];
  }

  function showToast(text, duration) {
    clearTimeout(state.toastTimer);
    screenToast.textContent = text;
    screenToast.hidden = false;
    state.toastTimer = setTimeout(function () {
      screenToast.hidden = true;
    }, duration || 2600);
    accessibleStatus.textContent = text;
  }

  function flashExecution() {
    executionRipple.classList.remove('is-active');
    void executionRipple.offsetWidth;
    executionRipple.classList.add('is-active');
    setTimeout(function () {
      executionRipple.classList.remove('is-active');
    }, 760);
  }

  function renderHealth() {
    var metric = METRICS[state.metric];
    $('#metricLabel').textContent = metric.label;
    $('#metricValue').textContent = metric.value;
    $('#metricUnit').textContent = metric.unit;
    $('#metricInsight').textContent = metric.insight;
    $('#detailText').textContent = metric.detail;

    $$('[data-metric]').forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-metric') === state.metric);
      button.setAttribute('aria-selected', button.getAttribute('data-metric') === state.metric ? 'true' : 'false');
    });
    $$('[data-range]').forEach(function (button) {
      button.classList.toggle('is-active', Number(button.getAttribute('data-range')) === state.range);
      button.setAttribute('aria-pressed', Number(button.getAttribute('data-range')) === state.range ? 'true' : 'false');
    });
    drawChart(metric.key);
  }

  function drawChart(metricKey) {
    var data = state.range === 7 ? HEALTH.recent7 : HEALTH.recent30;
    var values = data.map(function (entry) { return entry[metricKey]; });
    var width = 260;
    var height = 80;
    var padX = 5;
    var padY = 7;
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = max - min || 1;
    var points = values.map(function (value, index) {
      var x = padX + (index / (values.length - 1)) * (width - padX * 2);
      var y = padY + (1 - (value - min) / span) * (height - padY * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var pointString = points.join(' ');
    var areaString = padX + ',' + (height - padY) + ' ' + pointString + ' ' + (width - padX) + ',' + (height - padY);
    var last = points[points.length - 1].split(',');
    $('#chart').innerHTML =
      '<svg viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">' +
      '<polygon points="' + areaString + '" fill="rgba(202,225,216,0.10)"></polygon>' +
      '<polyline points="' + pointString + '" fill="none" stroke="rgba(211,231,222,0.78)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.7" fill="#e9ece1"></circle>' +
      '</svg>';
    $('#chartStart').textContent = data[0].date;
    $('#chartEnd').textContent = data[data.length - 1].date;
  }

  function renderSettings() {
    $('#recEnabled').checked = state.settings.enabled;
    $$('[data-cat]').forEach(function (input) {
      input.checked = state.settings.categories[input.getAttribute('data-cat')];
    });
    $('#freqValue').textContent = state.settings.frequency;
    $('#freqMinus').disabled = state.settings.frequency <= 1;
    $('#freqPlus').disabled = state.settings.frequency >= 3;
    $('#quietStart').value = state.settings.quietStart;
    $('#quietEnd').value = state.settings.quietEnd;
  }

  function renderReminders() {
    var list = $('#reminderList');
    var active = Object.keys(state.reminders).filter(function (key) { return state.reminders[key]; });
    $('#reminderEmpty').hidden = active.length !== 0;
    list.innerHTML = active.map(function (key) {
      var reminder = REMINDERS[key];
      return '<div class="reminder-item">' +
        '<span class="reminder-glyph">' + reminder.glyph + '</span>' +
        '<div class="reminder-copy"><strong>' + reminder.title + '</strong><span>' + reminder.detail + '</span></div>' +
        '<button type="button" data-remove-reminder="' + key + '">关闭</button>' +
        '</div>';
    }).join('');
  }

  function fillQuietOptions() {
    var options = [];
    for (var hour = 0; hour < 24; hour++) {
      var value = String(hour).padStart(2, '0') + ':00';
      options.push('<option value="' + value + '">' + value + '</option>');
    }
    $('#quietStart').innerHTML = options.join('');
    $('#quietEnd').innerHTML = options.join('');
  }

  function startAssistant() {
    if (state.processing) return;
    if (state.listening) {
      finishAssistant();
      return;
    }

    clearTimeout(state.replyTimer);
    state.listening = true;
    state.finalTranscript = '';
    voiceCommand.value = '';
    assistantLayer.hidden = false;
    commandSheet.hidden = true;
    assistantLayer.setAttribute('data-phase', 'listening');
    assistantStage.setAttribute('data-state', 'listening');
    assistantTitle.textContent = '正在聆听';
    assistantSubtitle.textContent = '说完后，再按一次侧键';
    voiceKey.classList.add('is-listening');
    accessibleStatus.textContent = '语音助手正在聆听';
    startRecognition();
  }

  function startRecognition() {
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      assistantSubtitle.textContent = '麦克风不可用时，可在下方输入演示指令';
      return;
    }
    try {
      var recognition = new Recognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = function (event) {
        var transcript = '';
        for (var index = event.resultIndex; index < event.results.length; index++) {
          transcript += event.results[index][0].transcript;
          if (event.results[index].isFinal) state.finalTranscript += event.results[index][0].transcript;
        }
        if (transcript.trim()) {
          voiceCommand.value = transcript.trim();
          assistantSubtitle.textContent = '「' + transcript.trim() + '」';
        }
      };
      recognition.onerror = function () {
        assistantSubtitle.textContent = '没有听见声音，可以在下方输入演示指令';
      };
      recognition.onend = function () {
        if (state.listening && state.finalTranscript.trim()) {
          voiceCommand.value = state.finalTranscript.trim();
        }
      };
      state.recognition = recognition;
      recognition.start();
    } catch (error) {
      assistantSubtitle.textContent = '麦克风暂未就绪，可在下方输入演示指令';
    }
  }

  function stopRecognition() {
    if (!state.recognition) return;
    try {
      state.recognition.stop();
    } catch (error) {}
    state.recognition = null;
  }

  function finishAssistant() {
    if (!state.listening || state.processing) return;
    stopRecognition();
    state.listening = false;
    voiceKey.classList.remove('is-listening');
    var command = (voiceCommand.value || state.finalTranscript || '').trim();
    if (!command) {
      assistantSubtitle.textContent = '没有听清，再说一次，或在下方输入演示指令';
      assistantTitle.textContent = '还在听';
      return;
    }
    processCommand(command);
  }

  async function processCommand(command) {
    state.processing = true;
    state.listening = false;
    voiceKey.classList.remove('is-listening');
    stopRecognition();
    assistantLayer.hidden = false;
    commandSheet.hidden = true;
    assistantLayer.setAttribute('data-phase', 'thinking');
    assistantStage.setAttribute('data-state', 'thinking');
    assistantTitle.textContent = '处理中';
    assistantSubtitle.textContent = '正在理解「' + command + '」';
    accessibleStatus.textContent = '正在理解指令';
    await wait(850);
    var intent = parseCommand(command);
    await executeIntent(intent);
    state.processing = false;
  }

  function closeAssistant() {
    assistantLayer.hidden = true;
    commandSheet.hidden = true;
    assistantLayer.removeAttribute('data-phase');
    state.listening = false;
    state.processing = false;
    voiceKey.classList.remove('is-listening');
    stopRecognition();
  }

  function showAssistantReply(title, message, duration) {
    clearTimeout(state.replyTimer);
    commandSheet.hidden = true;
    assistantLayer.hidden = false;
    assistantLayer.setAttribute('data-phase', 'reply');
    assistantStage.setAttribute('data-state', 'reply');
    assistantTitle.textContent = title;
    assistantSubtitle.textContent = message;
    accessibleStatus.textContent = title + '。' + message;
    state.replyTimer = setTimeout(closeAssistant, duration || 3300);
  }

  function showCommandSheet() {
    clearTimeout(state.replyTimer);
    assistantLayer.hidden = false;
    assistantLayer.setAttribute('data-phase', 'help');
    assistantStage.setAttribute('data-state', 'reply');
    assistantTitle.textContent = '试试这样说';
    assistantSubtitle.textContent = '点一个示例，或按侧键开口';
    commandSheet.hidden = false;
    accessibleStatus.textContent = '可以查看并选择演示指令';
  }

  function parseCommand(raw) {
    var text = raw.trim();

    if (/(关闭|清空|取消).*(所有|全部).*提醒/.test(text)) {
      return { type: 'clear-reminders' };
    }
    if (/返回|回到|回到主|主界面|首页|表盘/.test(text) && !/设置|提醒/.test(text)) {
      return { type: 'home', message: '已返回主界面' };
    }
    if (/你能做什么|会什么|怎么用|帮助|指令|功能/.test(text)) {
      return { type: 'help' };
    }
    if (/现在在哪|当前界面|什么界面/.test(text)) {
      return { type: 'where', message: '你正在' + screenName(state.screen) + '。' };
    }
    if (/几点|当前时间|现在时间/.test(text)) {
      return { type: 'datetime', mode: 'time' };
    }
    if (/几号|日期|星期几|周几|今天是/.test(text)) {
      return { type: 'datetime', mode: 'date' };
    }
    if (/我的提醒|查看提醒|开启的提醒|提醒列表/.test(text)) {
      return { type: 'reminders' };
    }
    if (/打开|进入|看看|查看/.test(text) && /提醒/.test(text)) {
      return { type: 'reminders' };
    }
    if (/恢复默认|重置设置|重置推荐/.test(text)) {
      return { type: 'reset' };
    }

    var categoryNames = {
      '运动': '运动',
      '睡眠': '睡眠',
      '心率': '心率健康',
      '用药': '用药提醒',
      '社交': '社交'
    };
    var selectedCategories = [];
    Object.keys(categoryNames).forEach(function (keyword) {
      if (text.indexOf(keyword) !== -1) selectedCategories.push(categoryNames[keyword]);
    });
    selectedCategories = selectedCategories.filter(function (value, index, list) {
      return list.indexOf(value) === index;
    });

    if (/恢复所有推荐|开启所有推荐/.test(text)) {
      return { type: 'recommendation-categories', mode: 'all', categories: [] };
    }
    if (/只推荐|仅推荐|只保留/.test(text) && selectedCategories.length) {
      return { type: 'recommendation-categories', mode: 'only', categories: selectedCategories };
    }
    if (selectedCategories.length && /推荐/.test(text) && /(关闭|不要|停止|停用|别)/.test(text)) {
      return { type: 'recommendation-categories', mode: 'off', categories: selectedCategories };
    }
    if (selectedCategories.length && /推荐/.test(text) && /(打开|开启|恢复)/.test(text)) {
      return { type: 'recommendation-categories', mode: 'on', categories: selectedCategories };
    }
    if (/(关闭|关掉|暂停|停用).*(智能)?推荐|推荐.*(关闭|关掉|暂停|停用)/.test(text)) {
      return { type: 'recommendations', enabled: false };
    }
    if (/(打开|开启|恢复).*(智能)?推荐/.test(text)) {
      return { type: 'recommendations', enabled: true };
    }

    var frequency = text.match(/每天最多\s*([1-3一二三])\s*条/);
    if (frequency) {
      var values = { '一': 1, '二': 2, '三': 3 };
      return { type: 'frequency', value: values[frequency[1]] || Number(frequency[1]) };
    }

    var quiet = text.match(/(?:安静时段|静默时段|免打扰|不打扰).*?(\d{1,2})(?:[:：]\d{1,2}|点)?\s*(?:到|至|-|~)\s*(\d{1,2})(?:[:：]\d{1,2}|点)?/);
    if (quiet) {
      return {
        type: 'quiet',
        start: String(Math.min(23, Number(quiet[1]))).padStart(2, '0') + ':00',
        end: String(Math.min(23, Number(quiet[2]))).padStart(2, '0') + ':00'
      };
    }

    if (/(取消|关闭).*(用药|吃药|服药)/.test(text)) return { type: 'reminder', key: 'medication', enabled: false };
    if (/(取消|关闭).*(社交|朋友|散步)/.test(text)) return { type: 'reminder', key: 'social', enabled: false };
    if (/(取消|关闭).*(久坐)/.test(text)) return { type: 'reminder', key: 'sedentary', enabled: false };
    if (/(取消|关闭).*(喝水|饮水)/.test(text)) return { type: 'reminder', key: 'water', enabled: false };
    if (/(取消|关闭).*(睡前|放松)/.test(text)) return { type: 'reminder', key: 'sleepRelax', enabled: false };
    if (/(取消|关闭).*(心率)/.test(text)) return { type: 'reminder', key: 'heartHigh', enabled: false };

    if (/久坐提醒/.test(text)) return { type: 'reminder', key: 'sedentary', enabled: true };
    if (/(喝水提醒|提醒我喝水|饮水提醒)/.test(text)) return { type: 'reminder', key: 'water', enabled: true };
    if (/(睡前放松|睡前提醒|放松提醒)/.test(text)) return { type: 'reminder', key: 'sleepRelax', enabled: true };
    if (/(心率偏高提醒|心率提醒)/.test(text)) return { type: 'reminder', key: 'heartHigh', enabled: true };
    if (/(用药提醒|吃药提醒|服药提醒|提醒我吃药|提醒吃药)/.test(text)) return { type: 'reminder', key: 'medication', enabled: true };
    if (/(社交提醒|提醒我.*朋友|提醒.*散步|安排.*朋友)/.test(text)) return { type: 'reminder', key: 'social', enabled: true };

    if (/设置|推荐|偏好|静默/.test(text)) {
      return { type: 'settings' };
    }

    var pressure = text.match(/(\d{2,3})\s*[\/／]\s*(\d{2,3})/);
    if (pressure) return { type: 'blood-pressure', value: pressure[1] + '/' + pressure[2] };

    var range = /30天|三十天|一个月/.test(text) ? 30 : 7;
    var compare = /比上周|较上周|这周比/.test(text);
    if (/状态怎么样|健康总结|今天怎么样|本周总结|一周总结|整体状态/.test(text)) {
      return { type: 'summary' };
    }
    if (/深睡|深度睡眠/.test(text)) return { type: 'health', metric: 'deep', range: range, compare: compare };
    if (/睡眠|睡得好|睡不好|安眠/.test(text)) return { type: 'health', metric: 'sleep', range: range, compare: compare };
    if (/心率|心跳|心脏|心悸|脉搏/.test(text)) return { type: 'health', metric: 'heart', range: range, compare: compare };
    if (/步数|走了|走路|运动步/.test(text)) return { type: 'health', metric: 'steps', range: range, compare: compare };
    if (/活跃|活动分钟|运动时长/.test(text)) return { type: 'health', metric: 'active', range: range, compare: compare };
    if (/(打开|看看|查看).*(健康|数据|趋势)/.test(text)) return { type: 'health', metric: state.metric, range: range };

    return { type: 'unknown' };
  }

  async function executeIntent(intent) {
    assistantLayer.hidden = true;
    assistantLayer.removeAttribute('data-phase');
    flashExecution();

    switch (intent.type) {
      case 'home':
        showScreen('home');
        accessibleStatus.textContent = '已返回主界面';
        break;
      case 'health':
        state.metric = intent.metric;
        state.range = intent.range;
        showScreen('health');
        showToast(intent.compare ? '已对照本周与上周' : METRICS[intent.metric].toast);
        break;
      case 'settings':
        showScreen('settings');
        showToast('已打开推荐设置');
        break;
      case 'reminders':
        showScreen('reminders');
        showToast('已打开我的提醒');
        break;
      case 'recommendations':
        state.settings.enabled = intent.enabled;
        saveSettings();
        showScreen('settings');
        renderSettings();
        showToast(intent.enabled ? '智能推荐已开启' : '智能推荐已关闭');
        break;
      case 'recommendation-categories':
        if (intent.mode === 'all') {
          Object.keys(state.settings.categories).forEach(function (key) {
            state.settings.categories[key] = true;
          });
          state.settings.enabled = true;
          showToast('已恢复所有推荐类别');
        } else if (intent.mode === 'only') {
          Object.keys(state.settings.categories).forEach(function (key) {
            state.settings.categories[key] = intent.categories.indexOf(key) !== -1;
          });
          state.settings.enabled = true;
          showToast('只保留：' + intent.categories.join('、'));
        } else {
          intent.categories.forEach(function (key) {
            state.settings.categories[key] = intent.mode === 'on';
          });
          if (intent.mode === 'on') state.settings.enabled = true;
          showToast((intent.mode === 'on' ? '已开启：' : '已关闭：') + intent.categories.join('、'));
        }
        saveSettings();
        showScreen('settings');
        renderSettings();
        break;
      case 'frequency':
        state.settings.frequency = intent.value;
        saveSettings();
        showScreen('settings');
        renderSettings();
        showToast('每日最多 ' + intent.value + ' 条推荐');
        break;
      case 'quiet':
        state.settings.quietStart = intent.start;
        state.settings.quietEnd = intent.end;
        saveSettings();
        showScreen('settings');
        renderSettings();
        showToast('安静时段已设为 ' + intent.start + ' 至 ' + intent.end);
        break;
      case 'reset':
        state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        saveSettings();
        showScreen('settings');
        renderSettings();
        showToast('已恢复默认设置');
        break;
      case 'reminder':
        state.reminders[intent.key] = intent.enabled;
        saveReminders();
        if (intent.enabled) {
          showScreen('reminders');
          renderReminders();
          showToast('已设置' + REMINDERS[intent.key].title);
        } else {
          renderReminders();
          showToast('已关闭' + REMINDERS[intent.key].title);
        }
        break;
      case 'clear-reminders':
        Object.keys(state.reminders).forEach(function (key) {
          state.reminders[key] = false;
        });
        saveReminders();
        showScreen('reminders');
        renderReminders();
        showToast('所有提醒已关闭');
        break;
      case 'blood-pressure':
        showToast('血压 ' + intent.value + ' 已记录', 3200);
        break;
      case 'help':
        showCommandSheet();
        break;
      case 'where':
        showAssistantReply('当前界面', intent.message, 2400);
        break;
      case 'summary':
        showAssistantReply(
          '今日健康概览',
          '昨夜睡眠 6.2 小时，夜间心率 68 次/分；今日步数 6,842 步，活跃 42 分钟。',
          3800
        );
        break;
      case 'datetime':
        var now = new Date();
        if (intent.mode === 'time') {
          showAssistantReply('当前时间', now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), 2200);
        } else {
          showAssistantReply('当前日期', now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }), 2800);
        }
        break;
      default:
        showAssistantReply('未识别指令', '按侧键再说一次，或说“你能做什么”查看示例。', 3200);
    }
  }

  voiceKey.addEventListener('click', function () {
    startAssistant();
  });

  voiceForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var command = voiceCommand.value.trim() || state.finalTranscript.trim();
    if (!command) {
      assistantSubtitle.textContent = '请输入一条演示指令';
      voiceCommand.focus();
      return;
    }
    processCommand(command);
  });

  voiceCommand.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAssistant();
    }
  });

  document.addEventListener('keydown', function (event) {
    var target = event.target;
    var isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT');
    if (event.key === 'Escape' && !assistantLayer.hidden) {
      closeAssistant();
      return;
    }
    if (event.code === 'Space' && !isTyping && assistantLayer.hidden && !state.processing) {
      event.preventDefault();
      startAssistant();
    }
  });

  document.addEventListener('click', function (event) {
    var demoCommand = event.target.closest('[data-demo-command]');
    if (demoCommand) {
      processCommand(demoCommand.getAttribute('data-demo-command'));
      return;
    }

    var voiceStart = event.target.closest('[data-voice-start]');
    if (voiceStart) {
      startAssistant();
      return;
    }

    var back = event.target.closest('[data-back]');
    if (back) {
      showScreen('home');
      return;
    }

    var metricButton = event.target.closest('[data-metric]');
    if (metricButton) {
      state.metric = metricButton.getAttribute('data-metric');
      renderHealth();
      return;
    }

    var rangeButton = event.target.closest('[data-range]');
    if (rangeButton) {
      state.range = Number(rangeButton.getAttribute('data-range'));
      renderHealth();
      return;
    }

    var removeReminder = event.target.closest('[data-remove-reminder]');
    if (removeReminder) {
      var key = removeReminder.getAttribute('data-remove-reminder');
      state.reminders[key] = false;
      saveReminders();
      renderReminders();
      showToast('已关闭' + REMINDERS[key].title);
    }
  });

  $('#recEnabled').addEventListener('change', function (event) {
    state.settings.enabled = event.target.checked;
    saveSettings();
    showToast(event.target.checked ? '智能推荐已开启' : '智能推荐已关闭');
  });

  $$('[data-cat]').forEach(function (input) {
    input.addEventListener('change', function (event) {
      state.settings.categories[event.target.getAttribute('data-cat')] = event.target.checked;
      saveSettings();
    });
  });

  $('#freqMinus').addEventListener('click', function () {
    state.settings.frequency = Math.max(1, state.settings.frequency - 1);
    saveSettings();
    renderSettings();
    showToast('每日最多 ' + state.settings.frequency + ' 条推荐');
  });

  $('#freqPlus').addEventListener('click', function () {
    state.settings.frequency = Math.min(3, state.settings.frequency + 1);
    saveSettings();
    renderSettings();
    showToast('每日最多 ' + state.settings.frequency + ' 条推荐');
  });

  $('#quietStart').addEventListener('change', function (event) {
    state.settings.quietStart = event.target.value;
    saveSettings();
    showToast('安静时段已更新');
  });

  $('#quietEnd').addEventListener('change', function (event) {
    state.settings.quietEnd = event.target.value;
    saveSettings();
    showToast('安静时段已更新');
  });

  $('#resetSettings').addEventListener('click', function () {
    state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    saveSettings();
    renderSettings();
    showToast('已恢复默认设置');
  });

  fillQuietOptions();
  renderSettings();
  renderHealth();
  renderReminders();
  showScreen('home');
})();
