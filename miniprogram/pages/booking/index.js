const app = getApp();
const { calcTier } = require('../../utils/memberTiers');

/** 从 globalData 读取当前用户等级 */
function getUserTier() {
  const u = app.globalData.userInfo;
  return calcTier((u.totalSpend || 0) + (u.totalTopUp || 0));
}


const SERVICE_TYPES = [
  { id: 7, name: '去甲',            duration: '60 分钟',  durationMin: 60,  price: 60 },
  { id: 3, name: '嫁接睫毛',        duration: '90 分钟',  durationMin: 90,  price: 200 },
  { id: 1, name: '日式凝胶美甲',    duration: '90 分钟',  durationMin: 90,  price: 300 },
  { id: 4, name: '种植睫毛',        duration: '120 分钟', durationMin: 120, price: 350 },
  { id: 5, name: '美甲 + 美睫组合', duration: '180 分钟', durationMin: 180, price: 499 },
  { id: 2, name: '高定款式美甲',    duration: '120 分钟', durationMin: 120, price: 600 },
  { id: 6, name: 'VIP 高定全套',    duration: '240 分钟', durationMin: 240, price: 1000 },
];

const VIP_SERVICE_ID = 6;
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

const MIN_SERVICE_DURATION = Math.min(...SERVICE_TYPES.map(s => s.durationMin));

function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

const BUSINESS_END_MIN = 22 * 60;                          // 22:00 正常营业结束
const MAX_END_MIN      = BUSINESS_END_MIN + 60;            // 23:00 含加班上限

/**
 * 根据已占用时间段 + 服务时长，计算每个起始时间段的状态
 * booked: true  → 被其他预约直接占用（显示"已约"）
 * past: true    → 今日已过去的时段（显示"已过"）
 * disabled: true, booked/past: false → 时间窗口内有冲突或超出营业时间（显示"不足"）
 *
 * @param {number} pastCutoffMin 今日当前分钟数（仅选今天时传入），0 表示不过滤
 */
function calcTimeSlots(blockedSlots, durationMin, pastCutoffMin = 0) {
  const blockedSet = new Set(blockedSlots);

  return ALL_TIME_SLOTS.map((slot) => {
    const startMin = timeToMin(slot);

    // 今日已过去的时段
    if (pastCutoffMin > 0 && startMin < pastCutoffMin) {
      return { time: slot, disabled: true, booked: false, past: true };
    }

    if (blockedSet.has(slot)) {
      return { time: slot, disabled: true, booked: true, past: false };
    }

    const endMin = startMin + durationMin;

    // 服务结束时间不能超过营业结束 + 1 小时加班上限
    if (endMin > MAX_END_MIN) {
      return { time: slot, disabled: true, booked: false, past: false };
    }

    // 检查 [startMin, endMin) 窗口内是否有任何时间段被占用
    const hasConflict = ALL_TIME_SLOTS.some(s => {
      const sMin = timeToMin(s);
      return sMin >= startMin && sMin < endMin && blockedSet.has(s);
    });

    return { time: slot, disabled: hasConflict, booked: false, past: false };
  });
}

/** 返回今日已过的分钟数，非今天返回 0 */
function getPastCutoffMin(selectedDate) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if (selectedDate !== todayStr) return 0;
  return now.getHours() * 60 + now.getMinutes();
}

Page({
  data: {
    tech: null,
    techId: '',
    services: SERVICE_TYPES,
    techPackages: [],
    timeSlots: ALL_TIME_SLOTS.map(t => ({ time: t, disabled: false, booked: false })),
    selectedService: null,
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
    // 会员权益
    userDiscount:     1.0,   // 当前会员折扣率
    userDiscountText: '',    // 如 '9折'，无折扣时为空
    userPerks:        {},    // tier.perks 对象，供 wxml 条件渲染
    // 注：折扣不在预约时计算，由管理员完成订单时按 discountRate 折算实际价格
  },

  onLoad(options) {
    const techId    = options.techId || 'tech_1';
    const serviceId = options.serviceId ? parseInt(options.serviceId) : null;
    const today     = this.formatDate(new Date());

    // store for use after packages are fetched
    this._pendingPkgId = options.pkgId || null;

    // 初始化会员折扣信息
    const tier    = getUserTier();
    const updates = {
      techId, selectedDate: today, minDate: today,
      userDiscount:     tier.discount,
      userDiscountText: tier.discount < 1.0 ? tier.discountText : '',
      userPerks:        tier.perks,
    };
    let dateToFetch = today;

    if (serviceId && !this._pendingPkgId) {
      // pre-select by serviceId only when NOT coming from a specific package
      const service = SERVICE_TYPES.find(s => s.id === serviceId);
      if (service) {
        updates.selectedService = service;
        if (service.id === VIP_SERVICE_ID && !tier.perks.noVipAdvanceLimit) {
          const minDate        = this.getDateAfterDays(VIP_ADVANCE_DAYS);
          updates.minDate      = minDate;
          updates.selectedDate = minDate;
          dateToFetch          = minDate;
        }
      }
    }

    this.setData(updates);
    this.fetchTech(techId);
    this.fetchAvailability(techId, dateToFetch);
    this.fetchTechPackages(techId);
  },

  async fetchTechPackages(techId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('products').where({ type: 'package', techIds: techId }).get();
      this.setData({ techPackages: res.data });

      // if we arrived from packageDetail, auto-select that package
      if (this._pendingPkgId) {
        const pkg = res.data.find(p => p._id === this._pendingPkgId);
        this._pendingPkgId = null;
        if (pkg) {
          this._applyServiceSelection({
            id: pkg.serviceId,
            name: pkg.name,
            duration: pkg.duration,
            durationMin: pkg.durationMin,
            price: pkg.price,
            _pkgId: pkg._id,
          });
        }
      }
    } catch (e) {
      console.error('fetchTechPackages:', e);
    }
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
        const blocked = res.result.blocked || [];
        const durationMin = this.data.selectedService?.durationMin || MIN_SERVICE_DURATION;
        const timeSlots = calcTimeSlots(blocked, durationMin, getPastCutoffMin(date));
        this.setData({ blockedSlots: blocked, timeSlots, selectedTime: '' });
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

  selectPackage(e) {
    const pkg = e.currentTarget.dataset.pkg;
    const service = {
      id: pkg.serviceId,
      name: pkg.name,
      duration: pkg.duration,
      durationMin: pkg.durationMin,
      price: pkg.price,
      _pkgId: pkg._id,
    };
    this._applyServiceSelection(service);
  },

  selectService(e) {
    this._applyServiceSelection(e.currentTarget.dataset.service);
  },

  _applyServiceSelection(service) {
    const timeSlots = calcTimeSlots(this.data.blockedSlots, service.durationMin, getPastCutoffMin(this.data.selectedDate));
    const today = this.formatDate(new Date());
    let minDate = today;
    const prevDate = this.data.selectedDate;
    let selectedDate = prevDate;

    const { userPerks } = this.data;

    // VIP 提前预约限制：钻石会员（noVipAdvanceLimit）可跳过
    if (service.id === VIP_SERVICE_ID && !userPerks.noVipAdvanceLimit) {
      minDate = this.getDateAfterDays(VIP_ADVANCE_DAYS);
      if (selectedDate < minDate) selectedDate = minDate;
    }

    const depositRequired = service.durationMin >= DEPOSIT_THRESHOLD_MIN;

    this.setData({
      selectedService: service,
      timeSlots, selectedTime: '', minDate, selectedDate,
      depositRequired, depositAmount: depositRequired ? DEPOSIT_AMOUNT : 0,
    });

    if (selectedDate !== prevDate) {
      this.fetchAvailability(this.data.techId, selectedDate);
    }
  },

  onDateChange(e) {
    const minDate = this.data.minDate;
    if (e.detail.value < minDate) {
      const msg = this.data.selectedService?.id === VIP_SERVICE_ID
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
    const { selectedService, selectedDate, selectedTime } = this.data;
    if (!selectedService) { wx.showToast({ title: '请选择服务项目', icon: 'none' }); return; }
    if (!selectedDate)    { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    if (!selectedTime)    { wx.showToast({ title: '请选择时间', icon: 'none' }); return; }
    this.setData({ step: 2 });
  },

  prevStep() { this.setData({ step: 1 }); },

  async submitBooking() {
    const { name, phone, tech, techId, selectedService, selectedDate, selectedTime, remark,
            depositRequired, depositAmount, userDiscount } = this.data;
    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' }); return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return;
    }

    wx.showLoading({ title: '提交中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'createBooking',
        data: {
          techId,
          techName:    tech.name,
          serviceId:   selectedService.id,
          serviceName: selectedService.name,
          duration:    selectedService.duration,
          durationMin: selectedService.durationMin,
          price:        selectedService.price,
          discountRate: userDiscount,
          date:         selectedDate,
          time:           selectedTime,
          name:           name.trim(),
          phone,
          remark,
          depositRequired,
          depositAmount,
        },
      });

      wx.hideLoading();

      if (res.result.success) {
        // 不在预约时更新 totalSpend，等付款完成后由 payOrder 云函数处理
        if (depositRequired) {
          await this._handleDepositPayment(res.result.bookingId, depositAmount);
        } else {
          this._showBookingSuccess(tech, selectedDate, selectedTime, selectedService, null, false);
        }
      } else {
        wx.showToast({ title: res.result.error || '提交失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      console.error('submitBooking:', e);
    }
  },

  // ─── 定金支付流程 ──────────────────────────────────────────────────────────
  async _handleDepositPayment(bookingId, amount) {
    const { tech, selectedDate, selectedTime, selectedService } = this.data;
    wx.showLoading({ title: '支付中...' });
    try {
      const payRes = await wx.cloud.callFunction({
        name: 'payDeposit',
        data: { bookingId, amount },
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
        // 调起微信支付收银台
        try {
          await wx.requestPayment(payRes.result.payParams);
          this._showBookingSuccess(tech, selectedDate, selectedTime, selectedService, null, true);
        } catch (payErr) {
          const cancelled = payErr.errMsg && payErr.errMsg.includes('cancel');
          wx.showModal({
            title: cancelled ? '支付已取消' : '支付失败',
            content: `预约已提交，定金尚未支付。您可以在「我的预约」中查看，或联系店家处理。`,
            showCancel: false,
            confirmText: '查看预约',
            success: () => wx.switchTab({ url: '/pages/profile/index' }),
          });
        }
      } else {
        // mock 模式：定金已自动标记已付
        this._showBookingSuccess(tech, selectedDate, selectedTime, selectedService, null, true);
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      console.error('_handleDepositPayment:', e);
    }
  },

  _showBookingSuccess(tech, date, time, service, tierUpgradedTo, depositPaid) {
    const tierMsg    = tierUpgradedTo ? `\n\n恭喜升级为 ${tierUpgradedTo}！` : '';
    const depositMsg = service.durationMin >= DEPOSIT_THRESHOLD_MIN
      ? (depositPaid
          ? `\n\n定金 ¥${DEPOSIT_AMOUNT} 已支付。`
          : `\n\n定金 ¥${DEPOSIT_AMOUNT} 待支付，技师确认前可全额退还。`)
      : '';
    wx.showModal({
      title: '预约成功！',
      content: `已提交预约，我们将尽快与您确认。\n\n技师：${tech.name}\n时间：${date} ${time}\n服务：${service.name}${depositMsg}${tierMsg}`,
      showCancel: false,
      confirmText: '查看预约',
      success: () => wx.switchTab({ url: '/pages/profile/index' }),
    });
  },
});
