const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

// 时间选项：10:00 → 22:00，每半小时一档，共 25 个
const TIME_OPTIONS = [];
for (let h = 10; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`);
}
// ['10:00','10:30', ... ,'21:30','22:00']  共 25 项

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** 根据开始/结束时间生成可预约起始时段列表（不含结束时间本身） */
function generateSlots(startTime, endTime) {
  const slots = [];
  const startMin = timeToMin(startTime);
  const endMin   = timeToMin(endTime);
  for (let t = startMin; t < endMin; t += 30) {
    const h = String(Math.floor(t / 60)).padStart(2, '0');
    const m = String(t % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
  }
  return slots;
}

function calcHours(start, end) {
  const diff = timeToMin(end) - timeToMin(start);
  if (diff <= 0) return 0;
  const h = diff / 60;
  return h === Math.floor(h) ? String(h) : h.toFixed(1);
}

function _fmt(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function _today() { return _fmt(new Date()); }

Page({
  data: {
    navTopPadding: NAV_TOP,
    techId: '',
    techName: '',
    updatedBy: 'admin',
    timeOptions: TIME_OPTIONS,

    // 日历
    year: 0,
    month: 0,
    monthLabel: '',
    calDays: [],
    loading: false,

    // scheduleMap: { 'YYYY-MM-DD': { state:'working'|'off', workStart, workEnd, hours } }
    scheduleMap: {},

    // 底部弹窗
    showSheet: false,
    sheetDate: '',
    sheetDateLabel: '',
    sheetIsOff: false,
    sheetStart: '10:00',
    sheetEnd: '22:00',
    startIndex: 0,
    endIndex: 24,
    sheetTotalHours: '12',
    saving: false,
  },

  onLoad(options) {
    const techId    = options.techId || '';
    const techName  = decodeURIComponent(options.name || '技师');
    const updatedBy = options.mode === 'tech' ? 'tech' : 'admin';
    const now = new Date();
    this.setData({ techId, techName, updatedBy, year: now.getFullYear(), month: now.getMonth() + 1 });
    this._renderMonth();
    this._loadSchedule();
  },

  // ── 月历 ─────────────────────────────────────────────────────────────────────
  _renderMonth() {
    const { year, month, scheduleMap } = this.data;
    const todayS  = _today();
    const firstDt = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0).getDate();
    const firstDow = (firstDt.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push({ empty: true });
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sch = scheduleMap[dateStr] || null;
      let badge = '';
      if (sch) badge = sch.state === 'off' ? '休' : (sch.hours ? `${sch.hours}h` : '');
      cells.push({ empty: false, day: d, dateStr, isToday: dateStr === todayS,
        state: sch ? sch.state : null, badge });
    }
    this.setData({ calDays: cells, monthLabel: `${year}年${String(month).padStart(2, '0')}月` });
  },

  async _loadSchedule() {
    const { techId, year, month } = this.data;
    if (!techId) return;
    this.setData({ loading: true });
    try {
      const yStr = String(year);
      const mStr = String(month).padStart(2, '0');
      const dateFrom = `${yStr}-${mStr}-01`;
      const dateTo   = `${yStr}-${mStr}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
      const res = await wx.cloud.callFunction({
        name: 'getSchedule',
        data: { techId, dateFrom, dateTo },
      });
      const map = {};
      if (res.result.success) {
        for (const s of res.result.schedules) {
          const hours = s.isWorking && s.workStart && s.workEnd
            ? calcHours(s.workStart, s.workEnd)
            : (s.isWorking ? '12' : '0');
          map[s.date] = {
            state: s.isWorking ? 'working' : 'off',
            workStart: s.workStart || '10:00',
            workEnd:   s.workEnd   || '22:00',
            hours,
          };
        }
      }
      this.setData({ scheduleMap: map }, () => this._renderMonth());
    } catch (e) {
      console.error('_loadSchedule:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  prevMonth() {
    let { year, month } = this.data;
    if (--month < 1) { month = 12; year--; }
    this.setData({ year, month, scheduleMap: {} }, () => { this._renderMonth(); this._loadSchedule(); });
  },

  nextMonth() {
    let { year, month } = this.data;
    if (++month > 12) { month = 1; year++; }
    this.setData({ year, month, scheduleMap: {} }, () => { this._renderMonth(); this._loadSchedule(); });
  },

  // ── 弹窗 ─────────────────────────────────────────────────────────────────────
  onDayTap(e) {
    const { date } = e.currentTarget.dataset;
    if (!date) return;
    const existing = this.data.scheduleMap[date] || null;

    let sheetIsOff = false;
    let sheetStart = '10:00';
    let sheetEnd   = '22:00';

    if (existing && existing.state === 'off') {
      sheetIsOff = true;
    } else if (existing && existing.workStart) {
      sheetStart = existing.workStart;
      sheetEnd   = existing.workEnd || '22:00';
    }

    const startIndex = TIME_OPTIONS.indexOf(sheetStart);
    const endIndex   = TIME_OPTIONS.indexOf(sheetEnd);
    const [, m, d]   = date.split('-');
    this.setData({
      showSheet: true,
      sheetDate: date,
      sheetDateLabel: `${parseInt(m)}月${parseInt(d)}日`,
      sheetIsOff,
      sheetStart,
      sheetEnd,
      startIndex: startIndex >= 0 ? startIndex : 0,
      endIndex:   endIndex   >= 0 ? endIndex   : 24,
      sheetTotalHours: sheetIsOff ? '0' : calcHours(sheetStart, sheetEnd),
    });
  },

  closeSheet() { this.setData({ showSheet: false }); },

  onStartChange(e) {
    const idx   = parseInt(e.detail.value);
    const start = TIME_OPTIONS[idx];
    const { sheetEnd } = this.data;
    // 若开始 >= 结束，自动顺延结束时间
    let endIdx = TIME_OPTIONS.indexOf(sheetEnd);
    if (timeToMin(start) >= timeToMin(sheetEnd)) {
      endIdx = Math.min(idx + 2, TIME_OPTIONS.length - 1);
    }
    const end = TIME_OPTIONS[endIdx];
    this.setData({
      startIndex: idx, sheetStart: start,
      endIndex: endIdx, sheetEnd: end,
      sheetIsOff: false,
      sheetTotalHours: calcHours(start, end),
    });
  },

  onEndChange(e) {
    const idx = parseInt(e.detail.value);
    const end = TIME_OPTIONS[idx];
    const { sheetStart } = this.data;
    if (timeToMin(end) <= timeToMin(sheetStart)) {
      wx.showToast({ title: '结束时间须晚于开始时间', icon: 'none' });
      return;
    }
    this.setData({
      endIndex: idx, sheetEnd: end,
      sheetIsOff: false,
      sheetTotalHours: calcHours(sheetStart, end),
    });
  },

  selectAllSlots() {
    const start = '10:00', end = '22:00';
    this.setData({
      sheetIsOff: false,
      sheetStart: start, sheetEnd: end,
      startIndex: 0, endIndex: 24,
      sheetTotalHours: calcHours(start, end),
    });
  },

  setDayOff() {
    this.setData({ sheetIsOff: true, sheetTotalHours: '0' });
  },

  undayOff() {
    const { sheetStart, sheetEnd } = this.data;
    this.setData({ sheetIsOff: false, sheetTotalHours: calcHours(sheetStart, sheetEnd) });
  },

  // ── 保存 ─────────────────────────────────────────────────────────────────────
  async saveSheet() {
    const { techId, updatedBy, sheetDate, sheetIsOff, sheetStart, sheetEnd } = this.data;
    if (!techId) return;

    const isWorking = !sheetIsOff;
    const slots     = isWorking ? generateSlots(sheetStart, sheetEnd) : [];
    const hours     = isWorking ? calcHours(sheetStart, sheetEnd) : '0';

    this.setData({ saving: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'setSchedule',
        data: {
          techId, date: sheetDate, isWorking,
          workStart: isWorking ? sheetStart : null,
          workEnd:   isWorking ? sheetEnd   : null,
          slots,
          updatedBy,
        },
      });
      if (result.result.success) {
        const map = {
          ...this.data.scheduleMap,
          [sheetDate]: { state: isWorking ? 'working' : 'off', workStart: sheetStart, workEnd: sheetEnd, hours },
        };
        this.setData({ scheduleMap: map, showSheet: false }, () => this._renderMonth());
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: result.result.error || '保存失败', icon: 'none' });
        console.error('saveSheet failed:', result.result.error);
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' });
      console.error('saveSheet catch:', e);
    } finally {
      this.setData({ saving: false });
    }
  },

  goBack() { wx.navigateBack(); },
});
