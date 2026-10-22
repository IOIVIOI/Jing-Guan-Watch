window.HEALTH_DATA = (function () {
  function day(date, sleep, deep, nightHR, steps, active, restingHR) {
    return { date: date, sleep: sleep, deep: deep, nightHR: nightHR, steps: steps, active: active, restingHR: restingHR };
  }

  var recent7 = [
    day('10/16', 6.0, 14, 66, 5210, 28, 67),
    day('10/17', 6.4, 15, 67, 6040, 35, 66),
    day('10/18', 5.8, 13, 69, 4830, 22, 69),
    day('10/19', 6.1, 14, 68, 7120, 46, 66),
    day('10/20', 6.5, 16, 67, 6450, 40, 65),
    day('10/21', 6.3, 15, 69, 5890, 33, 68),
    day('10/22', 6.2, 14, 70, 6842, 42, 68)
  ];

  var recent30 = [];
  var base = new Date(2026, 9, 22);
  for (var i = 29; i >= 0; i--) {
    var dt = new Date(base);
    dt.setDate(base.getDate() - i);
    var label = (dt.getMonth() + 1) + '/' + dt.getDate();
    var sleep = +(6.5 + Math.sin(i / 3.2) * 0.55 + (i % 2) * 0.12).toFixed(1);
    var nightHR = Math.round(65 + Math.sin(i / 2.7) * 3 + (i % 3));
    var steps = Math.round(5000 + Math.sin(i / 2.2) * 1500 + (i % 5) * 260);
    recent30.push({
      date: label,
      sleep: sleep,
      deep: Math.round(15 + Math.sin(i / 4) * 2),
      nightHR: nightHR,
      steps: steps,
      active: Math.round(30 + (i % 4) * 6),
      restingHR: nightHR - 3
    });
  }

  return {
    today: { date: '10月22日', steps: 6842, activeMinutes: 42, restingHR: 68, sleepHours: 7.4, deepSleepPct: 18, nightHR: 62 },
    recent7: recent7,
    recent30: recent30,
    prevWeek: { sleepAvg: 7.0, nightHRAvg: 62, restingHRAvg: 64, deepAvg: 19 }
  };
})();
