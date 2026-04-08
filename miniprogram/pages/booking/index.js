const app = getApp();
const { calcTier } = require('../../utils/memberTiers');

/** 从 globalData 读取当前用户等级 */
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

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

const BUSINESS_END_MIN = 22 * 60;
const MAX_END_MIN      = BUSINESS_END_MIN + 60;

function calcTimeSlots(blockedSlots, durationMin, pastCutoffMin = 0) {
  const blockedSet = new Set(blockedSlots);
  return ALL_TIME_SLOTS.map((slot) => {
    const startMin = timeToMin(slot);
    if (pastCutoffMin > 0 && startMin < pastCutoffMin) {
      return { time: slot, disabled: true, booked: false, past: true };
    }
    if (blockedSet.has(slot)) {
      return { time: slot, disabled: true, booked: true, past: false };
    }
    const endMin = startMin + durationMin;
    if (endMin > MAX_END_MIN) {
      return { time: slot, disabled: true, booked: false, past: false };
    }
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

Page({
  data: {
    quoteMode: false,
    quoteId: '',
    quoteInfo: null,
    tech: null,
    techId: '',
    technicians: [],
    availableTechs: [],
    showTechPicker: false,
    services: [],
    servicesLoading: true,
    minServiceDuration: MIN_SERVICE_DURATION_FALLBACK,
    techPackages: [],
    timeSlots: ALL_TIME_SLOTS.map(t => ({ time: t, disabled: false, booked: false })),
    scheduleOff: false,
    // 服务目录（两列选择器）
    categories:                 [],   // 大类列表
    allServices:                [],   // 全部服务项（原始）
    selectedCategoryId:         '',   // 当前左侧选中大类
    displayServiceGroups:       [],   // 右侧渲染用：[{subgroup, services}]
    selectedCategoryServiceCount: {}, // {categoryId: count} 左侧小红点
    // 多选服务
    selectedServices:   [],   // 当前已选服务数组
    selectedServiceIds: {},   // {id: true} 供 WXML 快速查询
    selectedPackageId:  '',   // 当前选中套餐 _id
    totalPrice:         0,
    totalDurationMin:   0,
    totalDuration:      '',
    hasVipService:      false,
    selectedDate: '',
    minDate: '',
    selectedTime: '',
    name: '',
    phone: '',
    remark: '',
    step: 1,
    loadingSlots: false,
    blockedSlots: [],
    depositRequired: false,
    depositAmount: 0,
    // 定金支付弹窗
    showDepositModal:    false,
    depositPayMethod:    'balance',
    userBalance:         0,
    depBalanceSufficient: false,
    // 会员权益
    userDiscount:     1.0,
    userDiscountText: '',
    userPerks:        {},
  },

  onLoad(options) {
    const techId  = options.techId  || '';
    const quoteId = options.quoteId || '';
    const today   = this.formatDate(new Date());

    this._pendingPkgId     = options.pkgId     || null;
    this._pendingServiceId = options.serviceId || null;

    const tier = getUserTier();
    this.setData({
      techId, quoteId, selectedDate: today, minDate: today,
      userDiscount:     tier.discount,
      userDiscountText: tier.discount < 1.0 ? tier.discountText : '',
      userPerks:        tier.perks,
    });
    this.loadTechnicians(techId);
    if (quoteId) {
      this.loadQuoteInfo(quoteId);
    } else {
      this.fetchServices();
    }
  },

  async loadQuoteInfo(quoteId) {
    this.setData({ servicesLoading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getMyQuotes', data: { id: quoteId } });
      if (!res.result.success) throw new Error(res.result.error);
      const q = res.result.quote;
      const durationMin = q.durationMin || 90;
      const parts = [q.mainService, ...(q.addons || [])].filter(Boolean);
      const serviceName = parts.join(' · ') || '报价服务';
      const dep = durationMin >= DEPOSIT_THRESHOLD_MIN;
      const timeSlots = calcTimeSlots([], durationMin, getPastCutoffMin(this.data.selectedDate));
      this.setData({
        quoteMode: true,
        quoteInfo: { ...q, serviceName },
        totalDurationMin: durationMin,
        totalDuration:    minToDisplay(durationMin),
        totalPrice:       q.price || 0,
        depositRequired:  dep,
        depositAmount:    dep ? DEPOSIT_AMOUNT : 0,
        timeSlots,
        servicesLoading: false,
      });
    } catch (e) {
      console.error('loadQuoteInfo:', e);
      this.setData({ servicesLoading: false });
      wx.showToast({ title: '报价信息加载失败', icon: 'none' });
    }
  },

  async loadTechnicians(preselectedTechId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians').orderBy('order', 'asc').get();
      const technicians = res.data.map(t => ({
        ...t,
        avatarIsImg: !!(t.avatar && t.avatar.length > 10),
      }));
      this.setData({ technicians, availableTechs: technicians });
      if (preselectedTechId) {
        const tech = technicians.find(t => t._id === preselectedTechId);
        if (tech) this.setData({ tech });
        this.fetchAvailability(preselectedTechId, this.data.selectedDate);
        this.fetchTechPackages(preselectedTechId);
      } else {
        this.setData({ showTechPicker: true });
      }
    } catch (e) {
      console.error('loadTechnicians:', e);
    }
  },

  async fetchTechPackages(techId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('products').where({ type: 'package', techIds: techId }).get();
      this.setData({ techPackages: res.data });

      if (this._pendingPkgId) {
        const pkg = res.data.find(p => p._id === this._pendingPkgId);
        this._pendingPkgId = null;
        if (pkg) {
          this._updateFromServices([{
            id: pkg.serviceId,
            name: pkg.name,
            duration: pkg.duration,
            durationMin: pkg.durationMin,
            price: pkg.price,
            _pkgId: pkg._id,
          }]);
        }
      }
    } catch (e) {
      console.error('fetchTechPackages:', e);
    }
  },

  async fetchServices() {
    this.setData({ servicesLoading: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'getServices' });
      if (!res.result.success) throw new Error(res.result.error || 'getServices failed');
      const categories  = res.result.categories || [];
      const allServices = res.result.services   || [];
      const minServiceDuration = allServices.length > 0
        ? Math.min(...allServices.map(s => s.durationMin || 60))
        : MIN_SERVICE_DURATION_FALLBACK;
      const selectedCategoryId   = categories.length > 0 ? categories[0]._id : '';
      const displayServiceGroups = this._buildServiceGroups(selectedCategoryId, allServices);
      this.setData({ categories, allServices, minServiceDuration, selectedCategoryId, displayServiceGroups, servicesLoading: false });
      if (this._pendingServiceId && !this._pendingPkgId) {
        const svc = allServices.find(s => s._id === this._pendingServiceId);
        this._pendingServiceId = null;
        if (svc) this._updateFromServices([svc]);
      }
    } catch (e) {
      console.error('fetchServices:', e);
      this.setData({ servicesLoading: false });
    }
  },

  selectCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    const displayServiceGroups = this._buildServiceGroups(categoryId, this.data.allServices);
    this.setData({ selectedCategoryId: categoryId, displayServiceGroups });
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

  async fetchTech(techId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians').doc(techId).get();
      const t = res.data;
      this.setData({ tech: { ...t, avatarIsImg: !!(t.avatar && t.avatar.length > 10) } });
    } catch (e) {
      console.error('fetchTech:', e);
    }
  },

  async fetchAvailability(techId, date) {
    this.setData({ loadingSlots: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAvailability',
        data: { techId, date },
      });
      if (res.result.success) {
        const blocked     = res.result.blocked || [];
        const isOff       = res.result.scheduleOff === true;
        const durationMin = this.data.totalDurationMin || this.data.minServiceDuration;
        const timeSlots   = calcTimeSlots(blocked, durationMin, getPastCutoffMin(date));
        this.setData({ blockedSlots: blocked, timeSlots, selectedTime: '', scheduleOff: isOff });
      }
    } catch (e) {
      console.error('fetchAvailability:', e);
    } finally {
      this.setData({ loadingSlots: false });
    }
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  getDateAfterDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return this.formatDate(d);
  },

  // ─── 多选服务核心逻辑 ──────────────────────────────────────────────────────

  selectService(e) {
    const service = e.currentTarget.dataset.service;
    let services = [...this.data.selectedServices];

    // 如果当前是套餐选中状态，先清除
    if (services.length > 0 && services[0]._pkgId) services = [];

    const idx = services.findIndex(s => s._id === service._id);
    if (idx >= 0) {
      services.splice(idx, 1);
    } else {
      services.push(service);
    }
    this._updateFromServices(services);
  },

  selectPackage(e) {
    const pkg = e.currentTarget.dataset.pkg;
    // 再次点击已选套餐 → 取消
    if (this.data.selectedPackageId === pkg._id) {
      this._updateFromServices([]);
      return;
    }
    this._updateFromServices([{
      id:          pkg.serviceId,
      name:        pkg.name,
      duration:    pkg.duration,
      durationMin: pkg.durationMin,
      price:       pkg.price,
      _pkgId:      pkg._id,
    }]);
  },

  _computeAvailableTechs(services) {
    const all = this.data.technicians;
    if (!services.length) return all;
    let availableSet = null;
    for (const svc of services) {
      if (!svc.techIds || svc.techIds.length === 0) continue;
      if (availableSet === null) {
        availableSet = new Set(svc.techIds);
      } else {
        availableSet = new Set([...availableSet].filter(id => svc.techIds.includes(id)));
      }
    }
    if (availableSet === null) return all;
    return all.filter(t => availableSet.has(t._id));
  },

  _updateFromServices(services) {
    const totalPrice       = services.reduce((sum, s) => sum + s.price, 0);
    const totalDurationMin = services.reduce((sum, s) => sum + s.durationMin, 0);
    const totalDuration    = minToDisplay(totalDurationMin);
    const hasVipService    = services.some(s => s.isVip === true);
    const depositRequired  = totalDurationMin >= DEPOSIT_THRESHOLD_MIN;

    const today    = this.formatDate(new Date());
    const prevDate = this.data.selectedDate || today;
    let minDate    = today;
    let selectedDate = prevDate;

    const { userPerks } = this.data;
    if (hasVipService && !userPerks.noVipAdvanceLimit) {
      minDate = this.getDateAfterDays(VIP_ADVANCE_DAYS);
      if (selectedDate < minDate) selectedDate = minDate;
    }

    const durationForSlots = totalDurationMin || this.data.minServiceDuration;
    const timeSlots = calcTimeSlots(this.data.blockedSlots, durationForSlots, getPastCutoffMin(selectedDate));

    // WXML 查询用的 id map
    const selectedServiceIds = {};
    services.forEach(s => { if (!s._pkgId) selectedServiceIds[s._id] = true; });
    const selectedPackageId = (services.length === 1 && services[0]._pkgId) ? services[0]._pkgId : '';

    // Per-category selection count for left-panel dot indicators
    const selectedCategoryServiceCount = {};
    services.forEach(s => {
      if (!s._pkgId && s.categoryId) {
        selectedCategoryServiceCount[s.categoryId] = (selectedCategoryServiceCount[s.categoryId] || 0) + 1;
      }
    });

    // Compute available techs for selected services; auto-switch if needed
    const availableTechs = this._computeAvailableTechs(services);
    let { techId, tech } = this.data;
    let techChanged = false;
    if (services.length > 0 && availableTechs.length > 0 && techId) {
      if (!availableTechs.find(t => t._id === techId)) {
        tech = { ...availableTechs[0] };
        techId = tech._id;
        techChanged = true;
      }
    }

    this.setData({
      selectedServices: services,
      selectedServiceIds,
      selectedPackageId,
      selectedCategoryServiceCount,
      totalPrice,
      totalDurationMin,
      totalDuration,
      hasVipService,
      depositRequired,
      depositAmount: depositRequired ? DEPOSIT_AMOUNT : 0,
      timeSlots,
      selectedTime: '',
      minDate,
      selectedDate,
      availableTechs,
      techId,
      tech,
    });

    if (selectedDate !== prevDate || techChanged) {
      this.fetchAvailability(techId, selectedDate);
    }
    if (techChanged) {
      this.fetchTechPackages(techId);
    }
  },

  openTechPicker() {
    this.setData({ showTechPicker: true });
  },

  closeTechPicker() {
    if (this.data.techId) this.setData({ showTechPicker: false });
  },

  changeTech(e) {
    const tech = e.currentTarget.dataset.tech;
    if (this.data.techId === tech._id) {
      this.setData({ showTechPicker: false });
      return;
    }
    this.setData({ tech, techId: tech._id, showTechPicker: false, selectedTime: '' });
    this.fetchAvailability(tech._id, this.data.selectedDate);
    if (!this.data.quoteMode) this.fetchTechPackages(tech._id);
  },

  noop() {},

  // ─── 日期 / 时间选择 ───────────────────────────────────────────────────────

  onDateChange(e) {
    const minDate = this.data.minDate;
    if (e.detail.value < minDate) {
      const msg = this.data.hasVipService
        ? `VIP 服务需提前 ${VIP_ADVANCE_DAYS} 天预约`
        : '不能选择过去的日期';
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }
    const newDate = e.detail.value;
    this.setData({ selectedDate: newDate, selectedTime: '' });
    this.fetchAvailability(this.data.techId, newDate);
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

  onNameInput(e)   { this.setData({ name: e.detail.value }); },
  onPhoneInput(e)  { this.setData({ phone: e.detail.value }); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  nextStep() {
    const { selectedServices, selectedDate, selectedTime, techId, quoteMode } = this.data;
    if (!techId)                              { wx.showToast({ title: '请先选择技师', icon: 'none' }); this.setData({ showTechPicker: true }); return; }
    if (!quoteMode && !selectedServices.length) { wx.showToast({ title: '请选择服务项目', icon: 'none' }); return; }
    if (!selectedDate)                        { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    if (!selectedTime)                        { wx.showToast({ title: '请选择时间', icon: 'none' }); return; }
    this.setData({ step: 2 });
  },

  prevStep() { this.setData({ step: 1 }); },

  async submitBooking() {
    if (this._submitting) return;

    const {
      name, phone, tech, techId,
      selectedServices, selectedDate, selectedTime, remark,
      depositRequired, depositAmount, userDiscount,
      totalPrice, totalDurationMin,
      quoteMode, quoteId, quoteInfo,
    } = this.data;

    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' }); return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return;
    }

    this._submitting = true;

    let serviceName, serviceId, serviceIds, durationMin, price, pkgId;
    if (quoteMode && quoteInfo) {
      serviceName  = quoteInfo.serviceName;
      serviceId    = '';
      serviceIds   = [];
      durationMin  = quoteInfo.durationMin || totalDurationMin;
      price        = quoteInfo.price || totalPrice;
    } else {
      serviceName = selectedServices.map(s => s.name).join(' + ');
      serviceId   = selectedServices[0]?._id || '';
      serviceIds  = selectedServices.map(s => s._id);
      durationMin = totalDurationMin;
      price       = totalPrice;
      pkgId       = (selectedServices.length === 1 && selectedServices[0]._pkgId)
        ? selectedServices[0]._pkgId : undefined;
    }

    wx.showLoading({ title: '提交中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'createBooking',
        data: {
          techId,
          techName:    tech.name,
          serviceId,
          serviceIds,
          serviceName,
          duration:    minToDisplay(durationMin),
          durationMin,
          price,
          discountRate: userDiscount,
          date:        selectedDate,
          time:        selectedTime,
          name:        name.trim(),
          phone,
          remark,
          depositRequired,
          depositAmount,
          pkgId,
          quoteId: quoteId || undefined,
        },
      });

      wx.hideLoading();

      if (res.result.success) {
        // 报价单标记为已确认（fire-and-forget）
        if (quoteId) {
          wx.cloud.callFunction({ name: 'getMyQuotes', data: { action: 'confirm', id: quoteId } })
            .catch(e => console.error('confirm quote status:', e));
        }

        // 请求订阅消息授权（预约确认通知）
        try {
          await wx.requestSubscribeMessage({
            tmplIds: [app.globalData.SUBSCRIBE_TMPL_ID],
          });
        } catch (e) { /* 用户拒绝或不支持，静默处理 */ }

        if (depositRequired) {
          await this._handleDepositPayment(res.result.bookingId, depositAmount);
        } else {
          this._showBookingSuccess(tech, selectedDate, selectedTime, serviceName, minToDisplay(durationMin), null, false);
        }
      } else {
        wx.showToast({ title: res.result.error || '提交失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      this._submitting = false;
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      console.error('submitBooking:', e);
    }
  },

  // ─── 定金支付流程 ──────────────────────────────────────────────────────────

  async _handleDepositPayment(bookingId, amount) {
    // 先读余额，再弹出支付方式选择
    this._pendingDepositBookingId = bookingId;
    this._pendingDepositAmount    = amount;

    const balance = app.globalData.userInfo.balance || 0;
    const depBalanceSufficient = balance >= amount;
    this.setData({
      userBalance:          balance,
      depBalanceSufficient,
      depositPayMethod:     depBalanceSufficient ? 'balance' : 'wechat',
      showDepositModal:     true,
    });
  },

  selectDepositPayMethod(e) {
    const method = e.currentTarget.dataset.method;
    if (method === 'balance' && !this.data.depBalanceSufficient) return;
    this.setData({ depositPayMethod: method });
  },

  cancelDepositModal() {
    this.setData({ showDepositModal: false });
    wx.showModal({
      title: '预约已提交',
      content: '定金尚未支付，您可以在「我的预约」中补交定金。',
      showCancel: false,
      confirmText: '查看预约',
      success: () => wx.switchTab({ url: '/pages/profile/index' }),
    });
  },

  async confirmDepositPay() {
    const { depositPayMethod } = this.data;
    const bookingId = this._pendingDepositBookingId;
    const amount    = this._pendingDepositAmount;
    const { tech, selectedDate, selectedTime, selectedServices, totalDuration } = this.data;
    const serviceName = selectedServices.map(s => s.name).join(' + ');

    this.setData({ showDepositModal: false });
    wx.showLoading({ title: '支付中...' });

    try {
      const payRes = await wx.cloud.callFunction({
        name: 'payDeposit',
        data: { bookingId, amount, paymentMethod: depositPayMethod },
      });
      wx.hideLoading();

      if (!payRes.result.success) {
        wx.showModal({
          title: '定金支付提示',
          content: `预约已提交，但定金支付失败（${payRes.result.error || '未知错误'}）。\n请联系店家确认后再操作。`,
          showCancel: false,
          confirmText: '查看预约',
          success: () => wx.switchTab({ url: '/pages/profile/index' }),
        });
        return;
      }

      if (payRes.result.mode === 'wechat') {
        try {
          await wx.requestPayment(payRes.result.payParams);
          this._showBookingSuccess(tech, selectedDate, selectedTime, serviceName, totalDuration, null, true);
        } catch (payErr) {
          const cancelled = payErr.errMsg && payErr.errMsg.includes('cancel');
          wx.showModal({
            title: cancelled ? '支付已取消' : '支付失败',
            content: '预约已提交，定金尚未支付。您可以在「我的预约」中查看，或联系店家处理。',
            showCancel: false,
            confirmText: '查看预约',
            success: () => wx.switchTab({ url: '/pages/profile/index' }),
          });
        }
      } else {
        this._showBookingSuccess(tech, selectedDate, selectedTime, serviceName, totalDuration, null, true);
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      console.error('confirmDepositPay:', e);
    }
  },

  _showBookingSuccess(tech, date, time, serviceName, duration, tierUpgradedTo, depositPaid) {
    const tierMsg    = tierUpgradedTo ? `\n\n恭喜升级为 ${tierUpgradedTo}！` : '';
    const depositMsg = this.data.depositRequired
      ? (depositPaid
          ? `\n\n定金 ¥${DEPOSIT_AMOUNT} 已支付。`
          : `\n\n定金 ¥${DEPOSIT_AMOUNT} 待支付，技师确认前可全额退还。`)
      : '';
    wx.showModal({
      title: '预约成功！',
      content: `已提交预约，我们将尽快与您确认。\n\n技师：${tech.name}\n时间：${date} ${time}\n服务：${serviceName}${depositMsg}${tierMsg}`,
      showCancel: false,
      confirmText: '查看预约',
      success: () => wx.switchTab({ url: '/pages/profile/index' }),
    });
  },
});
