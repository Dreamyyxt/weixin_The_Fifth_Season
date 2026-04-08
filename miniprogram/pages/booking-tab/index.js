const app = getApp();
const { calcTier } = require('../../utils/memberTiers');

function getUserTier() {
  const u = app.globalData.userInfo;
  return calcTier((u.totalSpend || 0) + (u.totalTopUp || 0));
}

const VIP_ADVANCE_DAYS = 3;
const DEPOSIT_THRESHOLD_MIN = 120;
const DEPOSIT_AMOUNT = 100;

const ALL_TIME_SLOTS = [
  '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00',
];

const MIN_SERVICE_DURATION_FALLBACK = 60;
const BUSINESS_END_MIN = 22 * 60;
const MAX_END_MIN      = BUSINESS_END_MIN + 60;

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcTimeSlots(blockedSlots, durationMin, pastCutoffMin = 0) {
  const blockedSet = new Set(blockedSlots);
  return ALL_TIME_SLOTS.map(slot => {
    const startMin = timeToMin(slot);
    if (pastCutoffMin > 0 && startMin < pastCutoffMin)
      return { time: slot, disabled: true, booked: false, past: true };
    if (blockedSet.has(slot))
      return { time: slot, disabled: true, booked: true, past: false };
    const endMin = startMin + durationMin;
    if (endMin > MAX_END_MIN)
      return { time: slot, disabled: true, booked: false, past: false };
    const hasConflict = ALL_TIME_SLOTS.some(s => {
      const sMin = timeToMin(s);
      return sMin >= startMin && sMin < endMin && blockedSet.has(s);
    });
    return { time: slot, disabled: hasConflict, booked: false, past: false };
  });
}

function getPastCutoffMin(selectedDate) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if (selectedDate !== todayStr) return 0;
  return now.getHours() * 60 + now.getMinutes();
}

function minToDisplay(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h} 小时 ${m} 分钟`;
  if (h > 0)          return `${h} 小时`;
  return `${m} 分钟`;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

Page({
  data: {
    step: 1,

    // ── 技师 ──────────────────────────────────────────────────────
    technicians:  [],
    techsLoading: true,
    techId:       '',
    tech:         null,

    // ── 服务目录 ──────────────────────────────────────────────────
    categories:                   [],
    allServices:                  [],
    selectedCategoryId:           '',
    displayServiceGroups:         [],
    selectedCategoryServiceCount: {},
    servicesLoading:              true,

    // ── 已选 ──────────────────────────────────────────────────────
    selectedServices:   [],
    selectedServiceIds: {},
    totalPrice:         0,
    totalDurationMin:   0,
    totalDuration:      '',
    hasVipService:      false,
    minServiceDuration: MIN_SERVICE_DURATION_FALLBACK,

    // ── 套餐 ──────────────────────────────────────────────────────
    techPackages:    [],
    selectedPackageId: '',

    // ── 日期 / 时间 ───────────────────────────────────────────────
    selectedDate: '',
    minDate:      '',
    selectedTime: '',
    timeSlots:    ALL_TIME_SLOTS.map(t => ({ time: t, disabled: false, booked: false })),
    blockedSlots: [],
    loadingSlots: false,
    scheduleOff:  false,

    // ── 定金 ──────────────────────────────────────────────────────
    depositRequired: false,
    depositAmount:   0,
    showDepositModal: false,
    depositPayMethod: 'balance',
    userBalance:      0,
    depBalanceSufficient: false,

    // ── 联系信息 ──────────────────────────────────────────────────
    name:   '',
    phone:  '',
    remark: '',

    // ── 会员 ──────────────────────────────────────────────────────
    userDiscount:     1.0,
    userDiscountText: '',
    userPerks:        {},

    // ── 关联报价 ──────────────────────────────────────────────────
    quoteId:        '',
    isQuoteBooking: false,
  },

  onLoad() {
    const today = formatDate(new Date());
    const tier  = getUserTier();
    this.setData({
      selectedDate: today, minDate: today,
      userDiscount:     tier.discount,
      userDiscountText: tier.discount < 1.0 ? tier.discountText : '',
      userPerks:        tier.perks,
    });
    this.loadTechnicians();
    this.fetchServices();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this._resetSession();
  },

  _resetSession() {
    const today = formatDate(new Date());
    const tier  = getUserTier();
    this.setData({
      step:  1,
      techId: '',
      tech:   null,
      quoteId:        '',
      isQuoteBooking: false,
      selectedCategoryId:           this.data.categories.length ? this.data.categories[0]._id : '',
      displayServiceGroups:         [],
      selectedCategoryServiceCount: {},
      selectedServices:             [],
      selectedServiceIds:           {},
      totalPrice:       0,
      totalDurationMin: 0,
      totalDuration:    '',
      hasVipService:    false,
      techPackages:     [],
      selectedPackageId: '',
      selectedDate:  today,
      minDate:       today,
      selectedTime:  '',
      timeSlots:     ALL_TIME_SLOTS.map(t => ({ time: t, disabled: false, booked: false })),
      blockedSlots:  [],
      loadingSlots:  false,
      scheduleOff:   false,
      depositRequired:  false,
      depositAmount:    0,
      showDepositModal: false,
      name:   '',
      phone:  '',
      remark: '',
      userDiscount:     tier.discount,
      userDiscountText: tier.discount < 1.0 ? tier.discountText : '',
      userPerks:        tier.perks,
    });
    // Refresh tech availability for today
    if (this.data.technicians.length) {
      this._refreshTechAvailability(this.data.technicians);
    }
    // Rebuild category display groups with reset selection
    if (this.data.categories.length) {
      const firstCatId = this.data.categories[0]._id;
      this.setData({
        selectedCategoryId:   firstCatId,
        displayServiceGroups: this._buildServiceGroups(firstCatId, this.data.allServices),
      });
    }
    // Apply pending booking pre-selections (from other pages via app.globalData)
    this._pendingBooking = app.globalData.pendingBooking || null;
    app.globalData.pendingBooking = null;
    this._applyPendingTech();
    this._applyPendingService();
  },

  // ── 技师加载 ──────────────────────────────────────────────────────
  async loadTechnicians() {
    this.setData({ techsLoading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians').orderBy('order', 'asc').get();
      const technicians = res.data.map(t => ({
        ...t,
        avatarIsImg: !!(t.avatar && t.avatar.length > 10),
        available: null,
      }));
      this.setData({ technicians, techsLoading: false });
      this._refreshTechAvailability(technicians);
      // Apply pending booking pre-selections (first visit: techs just loaded)
      this._applyPendingTech();
      this._applyPendingService();
    } catch (e) {
      this.setData({ techsLoading: false });
      console.error('loadTechnicians:', e);
    }
  },

  async _refreshTechAvailability(technicians) {
    try {
      const techIds = technicians.map(t => t._id);
      const today   = formatDate(new Date());
      const res = await wx.cloud.callFunction({ name: 'getAvailability', data: { techIds, date: today } });
      if (res.result.success) {
        const avail   = res.result.result;
        const updated = this.data.technicians.map(t => ({
          ...t,
          available: avail[t._id]?.available ?? t.available,
        }));
        this.setData({ technicians: updated });
      }
    } catch (e) { console.error('_refreshTechAvailability:', e); }
  },

  _applyPendingTech() {
    const p = this._pendingBooking;
    if (!p || !p.techId || !this.data.technicians.length) return;
    const tech = this.data.technicians.find(t => t._id === p.techId);
    if (!tech) return;
    this.setData({ techId: tech._id, tech, quoteId: p.quoteId || '' });
    // Quote booking: inject synthetic service, bypass service picker
    if (p.quoteId) {
      this._updateFromServices([{
        _id: '__quote__', name: '美甲款式 -- 报价单',
        price: p.quotePrice || 0, durationMin: p.quoteDurationMin || 90,
      }]);
      this.setData({ isQuoteBooking: true });
    }
    this.fetchAvailability(tech._id, this.data.selectedDate);
    this.fetchTechPackages(tech._id);
  },

  _applyPendingService() {
    const p = this._pendingBooking;
    if (!p || !p.serviceId || !this.data.allServices.length) return;
    const svc = this.data.allServices.find(s => s._id === p.serviceId);
    if (!svc) return;
    this._updateFromServices([svc]);
  },

  selectTech(e) {
    const tech = e.currentTarget.dataset.tech;
    if (this.data.techId === tech._id) return;
    this.setData({ tech, techId: tech._id, selectedTime: '', blockedSlots: [] });
    this.fetchAvailability(tech._id, this.data.selectedDate);
    this.fetchTechPackages(tech._id);
  },

  async fetchTechPackages(techId) {
    try {
      const db  = wx.cloud.database();
      const res = await db.collection('products').where({ type: 'package', techIds: techId }).get();
      this.setData({ techPackages: res.data });
      // Apply pending package selection
      const pkgId = this._pendingBooking?.pkgId;
      if (pkgId) {
        const pkg = res.data.find(p => p._id === pkgId);
        if (pkg) {
          this._updateFromServices([{
            id: pkg.serviceId, name: pkg.name, duration: pkg.duration,
            durationMin: pkg.durationMin, price: pkg.price, _pkgId: pkg._id,
          }]);
        }
      }
    } catch (e) { console.error('fetchTechPackages:', e); }
  },

  // ── 服务目录 ──────────────────────────────────────────────────────
  async fetchServices() {
    this.setData({ servicesLoading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getServices' });
      if (!res.result.success) throw new Error(res.result.error);
      const categories  = res.result.categories || [];
      const allServices = res.result.services   || [];
      const minServiceDuration = allServices.length > 0
        ? Math.min(...allServices.map(s => s.durationMin || 60))
        : MIN_SERVICE_DURATION_FALLBACK;
      const selectedCategoryId   = categories.length > 0 ? categories[0]._id : '';
      const displayServiceGroups = this._buildServiceGroups(selectedCategoryId, allServices);
      this.setData({ categories, allServices, minServiceDuration, selectedCategoryId, displayServiceGroups, servicesLoading: false });
      this._applyPendingService();
    } catch (e) {
      this.setData({ servicesLoading: false });
      console.error('fetchServices:', e);
    }
  },

  selectCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    this.setData({ selectedCategoryId: categoryId, displayServiceGroups: this._buildServiceGroups(categoryId, this.data.allServices) });
  },

  _buildServiceGroups(categoryId, allServices) {
    const catServices = (allServices || [])
      .filter(s => s.categoryId === categoryId)
      .sort((a, b) => (a.order || 99) - (b.order || 99));
    const groups = [];
    const groupMap = {};
    for (const svc of catServices) {
      const key = svc.subgroup || '';
      if (!Object.prototype.hasOwnProperty.call(groupMap, key)) {
        groupMap[key] = [];
        groups.push({ subgroup: key, services: groupMap[key] });
      }
      groupMap[key].push(svc);
    }
    return groups;
  },

  // ── 多选服务 ──────────────────────────────────────────────────────
  selectService(e) {
    const service = e.currentTarget.dataset.service;
    let services = [...this.data.selectedServices];
    if (services.length > 0 && services[0]._pkgId) services = [];
    const idx = services.findIndex(s => s._id === service._id);
    if (idx >= 0) services.splice(idx, 1);
    else          services.push(service);
    this._updateFromServices(services);
  },

  selectPackage(e) {
    const pkg = e.currentTarget.dataset.pkg;
    if (this.data.selectedPackageId === pkg._id) { this._updateFromServices([]); return; }
    this._updateFromServices([{
      id: pkg.serviceId, name: pkg.name, duration: pkg.duration,
      durationMin: pkg.durationMin, price: pkg.price, _pkgId: pkg._id,
    }]);
  },

  _updateFromServices(services) {
    const totalPrice       = services.reduce((sum, s) => sum + s.price, 0);
    const totalDurationMin = services.reduce((sum, s) => sum + s.durationMin, 0);
    const totalDuration    = minToDisplay(totalDurationMin);
    const hasVipService    = services.some(s => s.isVip === true);
    const depositRequired  = totalDurationMin >= DEPOSIT_THRESHOLD_MIN;

    const today    = formatDate(new Date());
    const prevDate = this.data.selectedDate || today;
    let minDate    = today;
    let selectedDate = prevDate;

    const { userPerks } = this.data;
    if (hasVipService && !userPerks.noVipAdvanceLimit) {
      const d = new Date();
      d.setDate(d.getDate() + VIP_ADVANCE_DAYS);
      minDate = formatDate(d);
      if (selectedDate < minDate) selectedDate = minDate;
    }

    const durationForSlots = totalDurationMin || this.data.minServiceDuration;
    const timeSlots = calcTimeSlots(this.data.blockedSlots, durationForSlots, getPastCutoffMin(selectedDate));

    const selectedServiceIds = {};
    services.forEach(s => { if (!s._pkgId) selectedServiceIds[s._id] = true; });
    const selectedPackageId = (services.length === 1 && services[0]._pkgId) ? services[0]._pkgId : '';

    const selectedCategoryServiceCount = {};
    services.forEach(s => {
      if (!s._pkgId && s.categoryId)
        selectedCategoryServiceCount[s.categoryId] = (selectedCategoryServiceCount[s.categoryId] || 0) + 1;
    });

    this.setData({
      selectedServices: services, selectedServiceIds, selectedPackageId,
      selectedCategoryServiceCount,
      totalPrice, totalDurationMin, totalDuration, hasVipService,
      depositRequired, depositAmount: depositRequired ? DEPOSIT_AMOUNT : 0,
      timeSlots, selectedTime: '', minDate, selectedDate,
    });

    if (selectedDate !== prevDate && this.data.techId) {
      this.fetchAvailability(this.data.techId, selectedDate);
    }
  },

  // ── 可用时间 ──────────────────────────────────────────────────────
  async fetchAvailability(techId, date) {
    if (!techId) return;
    this.setData({ loadingSlots: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getAvailability', data: { techId, date } });
      if (res.result.success) {
        const blocked     = res.result.blocked || [];
        const isOff       = res.result.scheduleOff === true;
        const durationMin = this.data.totalDurationMin || this.data.minServiceDuration;
        const timeSlots   = calcTimeSlots(blocked, durationMin, getPastCutoffMin(date));
        this.setData({ blockedSlots: blocked, timeSlots, selectedTime: '', scheduleOff: isOff });
      }
    } catch (e) { console.error('fetchAvailability:', e); }
    finally { this.setData({ loadingSlots: false }); }
  },

  // ── 日期 / 时间 ───────────────────────────────────────────────────
  onDateChange(e) {
    const minDate = this.data.minDate;
    if (e.detail.value < minDate) {
      wx.showToast({ title: this.data.hasVipService ? `VIP 服务需提前 ${VIP_ADVANCE_DAYS} 天预约` : '不能选择过去的日期', icon: 'none' });
      return;
    }
    const newDate = e.detail.value;
    this.setData({ selectedDate: newDate, selectedTime: '' });
    if (this.data.techId) this.fetchAvailability(this.data.techId, newDate);
  },

  selectTime(e) {
    const info = e.currentTarget.dataset.timeinfo;
    if (info.disabled) {
      const msg = info.booked ? '该时间段已被预约'
        : info.past ? '该时间段已过，请选择之后的时间'
        : '该时间段剩余时间不足，请选择其他时间';
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }
    this.setData({ selectedTime: info.time });
  },

  // ── 步骤跳转 ──────────────────────────────────────────────────────
  nextStep() {
    const { techId, selectedServices, selectedDate, selectedTime } = this.data;
    if (!techId)                      { wx.showToast({ title: '请先选择技师', icon: 'none' }); return; }
    if (!selectedServices.length)     { wx.showToast({ title: '请选择服务项目', icon: 'none' }); return; }
    if (!selectedDate)                { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    if (!selectedTime)                { wx.showToast({ title: '请选择时间', icon: 'none' }); return; }
    this.setData({ step: 2 });
  },

  prevStep() { this.setData({ step: 1 }); },

  onNameInput(e)   { this.setData({ name:   e.detail.value }); },
  onPhoneInput(e)  { this.setData({ phone:  e.detail.value }); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  noop() {},

  // ── 报价入口 ──────────────────────────────────────────────────────
  goQuote() { wx.navigateTo({ url: '/pages/quote/index' }); },

  // ── 提交预约 ──────────────────────────────────────────────────────
  async submitBooking() {
    if (this._submitting) return;
    const { name, phone, tech, techId, selectedServices, selectedDate, selectedTime, remark,
            depositRequired, depositAmount, userDiscount, totalPrice, totalDurationMin, quoteId, isQuoteBooking } = this.data;

    if (!name.trim())              { wx.showToast({ title: '请输入姓名', icon: 'none' }); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return; }

    this._submitting = true;

    const serviceName = selectedServices.map(s => s.name).join(' + ');
    const serviceId   = selectedServices[0]?._id || '';
    const serviceIds  = selectedServices.map(s => s._id);
    const durationMin = totalDurationMin;
    const price       = totalPrice;
    const pkgId       = (selectedServices.length === 1 && selectedServices[0]._pkgId) ? selectedServices[0]._pkgId : undefined;

    wx.showLoading({ title: '提交中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'createBooking',
        data: { techId, techName: tech.name, serviceId, serviceIds, serviceName,
                duration: minToDisplay(durationMin), durationMin, price,
                discountRate: isQuoteBooking ? 1.0 : userDiscount, date: selectedDate, time: selectedTime,
                name: name.trim(), phone, remark, depositRequired, depositAmount, pkgId,
                ...(quoteId ? { quoteId } : {}) },
      });
      wx.hideLoading();

      if (res.result.success) {
        try {
          await wx.requestSubscribeMessage({ tmplIds: [app.globalData.SUBSCRIBE_TMPL_ID] });
        } catch (_) {}

        if (depositRequired) {
          await this._handleDepositPayment(res.result.bookingId, depositAmount);
        } else {
          this._showSuccess(tech, selectedDate, selectedTime, serviceName, minToDisplay(durationMin));
        }
      } else {
        wx.showToast({ title: res.result.error || '提交失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      console.error('submitBooking:', e);
    } finally {
      this._submitting = false;
    }
  },

  // ── 定金支付 ──────────────────────────────────────────────────────
  async _handleDepositPayment(bookingId, amount) {
    this._pendingDepositBookingId = bookingId;
    this._pendingDepositAmount    = amount;
    const balance = app.globalData.userInfo.balance || 0;
    const depBalanceSufficient = balance >= amount;
    this.setData({ userBalance: balance, depBalanceSufficient,
                   depositPayMethod: depBalanceSufficient ? 'balance' : 'wechat',
                   showDepositModal: true });
  },

  selectDepositPayMethod(e) {
    const method = e.currentTarget.dataset.method;
    if (method === 'balance' && !this.data.depBalanceSufficient) return;
    this.setData({ depositPayMethod: method });
  },

  cancelDepositModal() {
    this.setData({ showDepositModal: false });
    wx.showModal({
      title: '预约已提交', content: '定金尚未支付，您可以在「我的预约」中补交定金。',
      showCancel: false, confirmText: '查看预约',
      success: () => wx.switchTab({ url: '/pages/profile/index' }),
    });
  },

  async confirmDepositPay() {
    const { depositPayMethod, tech, selectedDate, selectedTime, selectedServices, totalDuration } = this.data;
    const bookingId   = this._pendingDepositBookingId;
    const amount      = this._pendingDepositAmount;
    const serviceName = selectedServices.map(s => s.name).join(' + ');
    this.setData({ showDepositModal: false });
    wx.showLoading({ title: '支付中...' });
    try {
      const payRes = await wx.cloud.callFunction({ name: 'payDeposit', data: { bookingId, amount, paymentMethod: depositPayMethod } });
      wx.hideLoading();
      if (!payRes.result.success) {
        wx.showModal({ title: '定金支付提示',
          content: `预约已提交，但定金支付失败（${payRes.result.error || '未知错误'}）。\n请联系店家确认后再操作。`,
          showCancel: false, confirmText: '查看预约',
          success: () => wx.switchTab({ url: '/pages/profile/index' }) });
        return;
      }
      if (payRes.result.mode === 'wechat') {
        try {
          await wx.requestPayment(payRes.result.payParams);
          this._showSuccess(tech, selectedDate, selectedTime, serviceName, totalDuration, true);
        } catch (payErr) {
          wx.showModal({ title: payErr.errMsg?.includes('cancel') ? '支付已取消' : '支付失败',
            content: '预约已提交，定金尚未支付。您可以在「我的预约」中查看，或联系店家处理。',
            showCancel: false, confirmText: '查看预约',
            success: () => wx.switchTab({ url: '/pages/profile/index' }) });
        }
      } else {
        this._showSuccess(tech, selectedDate, selectedTime, serviceName, totalDuration, true);
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    }
  },

  _showSuccess(tech, date, time, serviceName, duration, depositPaid) {
    const depositMsg = this.data.depositRequired
      ? (depositPaid ? `\n\n定金 ¥${DEPOSIT_AMOUNT} 已支付。` : `\n\n定金 ¥${DEPOSIT_AMOUNT} 待支付，技师确认前可全额退还。`)
      : '';
    wx.showModal({
      title: '预约成功！',
      content: `已提交预约，我们将尽快与您确认。\n\n技师：${tech.name}\n时间：${date} ${time}\n服务：${serviceName}${depositMsg}`,
      showCancel: false, confirmText: '查看预约',
      success: () => wx.switchTab({ url: '/pages/profile/index' }),
    });
  },
});
