const app = getApp();
const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

const ALL_TIME_SLOTS = [
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
  '22:00', '22:30',
];

const SOURCES = [
  { key: 'phone',    label: '电话预约' },
  { key: 'dianping', label: '大众点评' },
  { key: 'meituan',  label: '美团' },
  { key: 'douyin',   label: '抖音团购' },
  { key: 'walkin',   label: '现场来客' },
  { key: 'other',    label: '其他' },
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

Page({
  data: {
    navTopPadding: NAV_TOP,
    role: '',
    linkedTechId: '',
    techs:    [],
    services: [],         // loaded from products collection
    sources:  SOURCES,
    availableSlots: ALL_TIME_SLOTS,
    slotsLoading:   false,
    servicesLoading: true,
    // form
    sourceIdx:  0,
    techIdx:    0,
    serviceIdx: 0,
    timeIdx:    0,
    guestName:  '',
    guestPhone: '',
    date:       '',
    priceInput: '',
    remark:     '',
  },

  onLoad(options) {
    const { role, linkedTechId } = app.globalData.userInfo;
    this.setData({ role, linkedTechId, date: today() });
    Promise.all([
      this._loadTechs(linkedTechId, role, options.presetTechId),
      this._loadServices(),
    ]);
  },

  async _loadServices() {
    this.setData({ servicesLoading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('products')
        .orderBy('order', 'asc')
        .get();
      const services = res.data
        .filter(p => p.type === 'service' || p.type === 'package')
        .map(p => ({
          _id:         p._id,
          name:        p.name || '',
          price:       parseFloat(p.price) || 0,
          durationMin: parseInt(p.durationMin) || 60,
          duration:    p.duration || '',
        }));
      if (services.length > 0) {
        this.setData({
          services,
          priceInput: String(services[this.data.serviceIdx]?.price || 0),
        });
      }
    } catch (e) { console.error('_loadServices:', e); }
    finally { this.setData({ servicesLoading: false }); }
  },

  async _loadTechs(linkedTechId, role, presetTechId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians').orderBy('order', 'asc').get();
      let techs = res.data.map(t => ({ _id: t._id, name: t.name }));
      if (role === 'technician' && linkedTechId) {
        techs = techs.filter(t => t._id === linkedTechId);
      }
      const defaultIdx = presetTechId
        ? Math.max(0, techs.findIndex(t => t._id === presetTechId))
        : (linkedTechId ? Math.max(0, techs.findIndex(t => t._id === linkedTechId)) : 0);
      this.setData({ techs, techIdx: defaultIdx });
      if (techs.length > 0) {
        this._loadAvailability(techs[defaultIdx]._id, this.data.date);
      }
    } catch (e) { console.error('_loadTechs:', e); }
  },

  async _loadAvailability(techId, date) {
    if (!techId || !date) return;
    this.setData({ slotsLoading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getAvailability', data: { techId, date } });
      const blocked = new Set(res.result.success ? (res.result.blocked || []) : []);
      const todayStr = today();
      // Filter past times on today
      let nowMin = 0;
      if (date === todayStr) {
        const now = new Date();
        nowMin = now.getHours() * 60 + now.getMinutes();
      }
      const available = ALL_TIME_SLOTS.filter(t => {
        const [h, m] = t.split(':').map(Number);
        if (date === todayStr && h * 60 + m <= nowMin) return false;
        return !blocked.has(t);
      });
      this.setData({
        availableSlots: available.length > 0 ? available : [],
        timeIdx: 0,
      });
    } catch (e) {
      this.setData({ availableSlots: ALL_TIME_SLOTS });
    } finally {
      this.setData({ slotsLoading: false });
    }
  },

  onSourceChange(e)  { this.setData({ sourceIdx: Number(e.detail.value) }); },

  onTechChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ techIdx: idx });
    const tech = this.data.techs[idx];
    if (tech) this._loadAvailability(tech._id, this.data.date);
  },

  onServiceChange(e) {
    const idx = Number(e.detail.value);
    const svc = this.data.services[idx];
    this.setData({ serviceIdx: idx, priceInput: svc ? String(svc.price) : '' });
  },

  onDateChange(e) {
    const date = e.detail.value;
    this.setData({ date });
    const tech = this.data.techs[this.data.techIdx];
    if (tech) this._loadAvailability(tech._id, date);
  },

  onTimeChange(e)  { this.setData({ timeIdx: Number(e.detail.value) }); },
  onInput(e)       { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },

  async submit() {
    const { techs, techIdx, services, serviceIdx, availableSlots, timeIdx,
            sourceIdx, guestName, guestPhone, date, priceInput, remark } = this.data;
    const tech = techs[techIdx];
    const svc  = services[serviceIdx];
    const time = availableSlots[timeIdx];

    if (!tech) { wx.showToast({ title: '请选择技师', icon: 'none' }); return; }
    if (!svc)  { wx.showToast({ title: '请选择服务项目', icon: 'none' }); return; }
    if (!date) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    if (!time) { wx.showToast({ title: '该时段已无可用时间', icon: 'none' }); return; }

    wx.showLoading({ title: '创建中...' });
    try {
      const result = await wx.cloud.callFunction({
        name: 'adminCreateBooking',
        data: {
          source:      SOURCES[sourceIdx].key,
          guestName:   guestName.trim() || '散客',
          guestPhone:  guestPhone.trim(),
          techId:      tech._id,
          techName:    tech.name,
          serviceName: svc.name,
          serviceId:   svc._id,
          date,
          time,
          price:       parseFloat(priceInput) || svc.price,
          durationMin: svc.durationMin,
          duration:    svc.duration,
          remark:      remark.trim(),
        },
      });
      wx.hideLoading();
      if (result.result.success) {
        wx.showToast({ title: '预约已创建', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1200);
      } else {
        wx.showToast({ title: result.result.error || '创建失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  goBack() { wx.navigateBack(); },
});
