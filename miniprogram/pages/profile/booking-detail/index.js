const app = getApp();

Page({
  data: {
    bookingId: '',
    loading: true,
    booking: null,
    // Derived display values
    statusLabel: '',
    statusCls: '',
    amountDue: 0,
    payBtnAvailable: false,
    payBtnText: '支付订单',
    canCancel: false,
    depositLabel: '',
    depositCls: '',
    paying: false,
    // 尾款支付方式弹窗
    showPayModal:      false,
    paymentMethod:     'balance',   // 'balance' | 'wechat'
    userBalance:       0,
    balanceSufficient: false,
    // 定金支付方式弹窗
    showDepositModal:      false,
    depositPayMethod:      'balance',
    depBalanceSufficient:  false,
  },

  onLoad(options) {
    this.setData({ bookingId: options.id });
    this.fetchDetail();
  },

  onShow() {
    if (this.data.bookingId) this.fetchDetail();
    // 先用缓存值快速渲染余额，再从 DB 刷新
    this.setData({ userBalance: app.globalData.userInfo.balance || 0 });
    this._refreshBalance();
  },

  async _refreshBalance() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('users').where({}).get();
      if (res.data && res.data.length > 0) {
        const balance = res.data[0].balance || 0;
        app.saveUserInfo({ balance });
        const amountDue            = this.data.amountDue || 0;
        const balanceSufficient    = balance >= amountDue && amountDue > 0;
        const depAmt               = this.data.booking?.depositAmount || 0;
        const depBalanceSufficient = depAmt > 0 && balance >= depAmt;
        this.setData({
          userBalance:          balance,
          balanceSufficient,
          paymentMethod:        balanceSufficient    ? 'balance' : 'wechat',
          depBalanceSufficient,
          depositPayMethod:     depBalanceSufficient ? 'balance' : 'wechat',
        });
      }
    } catch (e) { /* 静默失败，保持缓存值 */ }
  },

  async fetchDetail() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('bookings').doc(this.data.bookingId).get();
      this._processBooking(res.data);
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      console.error('booking-detail fetchDetail:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  _processBooking(b) {
    // ─── Status label & class ───────────────────────────────────────────
    let statusLabel, statusCls;
    switch (b.status) {
      case 'cancelled':
        statusLabel = '已取消'; statusCls = 'cancelled'; break;
      case 'completed':
        if (b.paymentStatus === 'paid') {
          statusLabel = '已完成'; statusCls = 'done';
        } else {
          statusLabel = '待付款'; statusCls = 'unpaid';
        }
        break;
      case 'confirmed':
        statusLabel = '预约已确认'; statusCls = 'confirmed'; break;
      default:
        statusLabel = '预约待确认'; statusCls = 'pending'; break;
    }

    // ─── Amount due ──────────────────────────────────────────────────────
    const depositPaid = b.depositStatus === 'paid' ? (b.depositAmount || 0) : 0;
    const finalPrice  = b.finalPrice;
    const amountDue   = finalPrice !== undefined
      ? Math.max(0, finalPrice - depositPaid)
      : null;

    // ─── Payment button state ────────────────────────────────────────────
    const payBtnAvailable = b.status === 'completed'
      && b.paymentStatus !== 'paid'
      && finalPrice !== undefined;
    const payBtnText = b.paymentStatus === 'paid' ? '已支付' : '支付订单';

    // ─── Cancel eligibility ──────────────────────────────────────────────
    const canCancel = b.status === 'pending' || b.status === 'confirmed';

    // ─── Deposit tag ─────────────────────────────────────────────────────
    const depositLabelMap = { pending: '定金待收', paid: '定金已收', forfeited: '定金不退', refunded: '定金已退' };
    const depositClsMap   = { pending: 'pending', paid: 'paid', forfeited: 'forfeited', refunded: 'refunded' };
    const depositLabel = b.depositRequired ? (depositLabelMap[b.depositStatus] || '') : '';
    const depositCls   = b.depositRequired ? (depositClsMap[b.depositStatus]   || '') : '';

    const userBalance          = this.data.userBalance;
    const balanceSufficient    = amountDue > 0 && userBalance >= amountDue;
    const depAmt               = b.depositAmount || 0;
    const depBalanceSufficient = depAmt > 0 && userBalance >= depAmt;

    this.setData({
      booking: b,
      statusLabel,
      statusCls,
      amountDue,
      payBtnAvailable,
      payBtnText,
      canCancel,
      depositLabel,
      depositCls,
      balanceSufficient,
      paymentMethod:         balanceSufficient    ? 'balance' : 'wechat',
      depBalanceSufficient,
      depositPayMethod:      depBalanceSufficient ? 'balance' : 'wechat',
    });
  },

  // ─── Payment ────────────────────────────────────────────────────────────

  showPaymentSelector() {
    if (!this.data.payBtnAvailable) return;
    this.setData({ showPayModal: true });
  },

  cancelPayModal() {
    this.setData({ showPayModal: false });
  },

  selectPayMethod(e) {
    const method = e.currentTarget.dataset.method;
    // 余额不足时不允许选择余额支付
    if (method === 'balance' && !this.data.balanceSufficient) return;
    this.setData({ paymentMethod: method });
  },

  async confirmPay() {
    if (this.data.paying) return;
    this.setData({ showPayModal: false, paying: true });
    wx.showLoading({ title: '支付中...' });

    try {
      const payRes = await wx.cloud.callFunction({
        name: 'payOrder',
        data: {
          bookingId:     this.data.bookingId,
          paymentMethod: this.data.paymentMethod,
        },
      });
      wx.hideLoading();

      if (!payRes.result.success) {
        wx.showToast({ title: payRes.result.error || '支付失败', icon: 'none' });
        return;
      }

      if (payRes.result.mode === 'wechat') {
        try {
          await wx.requestPayment(payRes.result.payParams);
          this._onPaySuccess(payRes.result);
        } catch (err) {
          const cancelled = err.errMsg && err.errMsg.includes('cancel');
          wx.showToast({ title: cancelled ? '已取消支付' : '支付失败', icon: 'none' });
        }
      } else {
        this._onPaySuccess(payRes.result);
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    } finally {
      this.setData({ paying: false });
    }
  },

  // 支付成功后：刷新订单 + 同步用户积分/消费/余额数据
  async _onPaySuccess(result) {
    const { pointsEarned, newPoints, tierUpgraded, newTierName, newTotalSpend, newBalance } = result || {};

    const updates = {};
    if (newTotalSpend !== undefined) updates.totalSpend = newTotalSpend;
    if (newPoints     !== undefined) updates.points     = newPoints;
    if (newBalance    !== undefined) updates.balance    = newBalance;
    if (Object.keys(updates).length > 0) app.saveUserInfo(updates);
    if (newBalance !== undefined) this.setData({ userBalance: newBalance });

    // 刷新订单详情
    this.fetchDetail();

    // 提示
    if (tierUpgraded && newTierName) {
      wx.showModal({
        title: '支付成功，会员升级！',
        content: `恭喜升级为 ${newTierName}！\n获得 ${pointsEarned || 0} 积分`,
        showCancel: false,
        confirmText: '太棒了',
      });
    } else if (pointsEarned > 0) {
      wx.showToast({ title: `支付成功，获得 ${pointsEarned} 积分`, icon: 'success' });
    } else {
      wx.showToast({ title: '支付成功', icon: 'success' });
    }
  },

  // ─── Deposit Payment ────────────────────────────────────────────────────

  showDepositPaySelector() {
    this.setData({ showDepositModal: true });
  },

  cancelDepositModal() {
    this.setData({ showDepositModal: false });
  },

  selectDepositPayMethod(e) {
    const method = e.currentTarget.dataset.method;
    if (method === 'balance' && !this.data.depBalanceSufficient) return;
    this.setData({ depositPayMethod: method });
  },

  async confirmDepositPay() {
    if (this.data.paying) return;
    const { booking, depositPayMethod } = this.data;
    this.setData({ showDepositModal: false, paying: true });
    wx.showLoading({ title: '支付中...' });
    try {
      const payRes = await wx.cloud.callFunction({
        name: 'payDeposit',
        data: {
          bookingId:     booking._id,
          amount:        booking.depositAmount,
          paymentMethod: depositPayMethod,
        },
      });
      wx.hideLoading();

      if (!payRes.result.success) {
        wx.showToast({ title: payRes.result.error || '支付失败', icon: 'none' });
        return;
      }

      if (payRes.result.mode === 'wechat') {
        try {
          await wx.requestPayment(payRes.result.payParams);
        } catch (err) {
          const cancelled = err.errMsg && err.errMsg.includes('cancel');
          wx.showToast({ title: cancelled ? '已取消支付' : '支付失败', icon: 'none' });
          return;
        }
      }

      // 余额支付成功后同步余额缓存
      if (payRes.result.newBalance !== undefined) {
        app.saveUserInfo({ balance: payRes.result.newBalance });
        this.setData({ userBalance: payRes.result.newBalance });
      }
      wx.showToast({ title: '定金支付成功', icon: 'success' });
      setTimeout(() => this.fetchDetail(), 800);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    } finally {
      this.setData({ paying: false });
    }
  },

  // ─── Cancel ─────────────────────────────────────────────────────────────
  cancelBooking() {
    const b = this.data.booking;
    if (!b || !this.data.canCancel) return;

    const isConfirmed = b.status === 'confirmed';
    const willForfeit = isConfirmed && b.depositRequired
      && b.depositStatus !== 'none' && b.depositStatus !== 'forfeited';
    const baseInfo = `服务：${b.serviceName}\n技师：${b.techName}\n时间：${b.date} ${b.time}`;
    const content  = willForfeit
      ? `此预约已由技师确认，取消后定金 ¥${b.depositAmount} 将不予退还。\n\n${baseInfo}`
      : `确定要取消预约吗？\n\n${baseInfo}`;

    wx.showModal({
      title: willForfeit ? '定金不退，确认取消？' : '取消预约',
      content,
      confirmText: '确认取消',
      confirmColor: '#E74C3C',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '取消中...' });
        try {
          const result = await wx.cloud.callFunction({
            name: 'cancelBooking',
            data: { bookingId: b._id },
          });
          wx.hideLoading();
          if (result.result.success) {
            const r = result.result;
            if (r.depositRefunded && r.depositRefundAmount > 0) {
              app.saveUserInfo({ balance: (app.globalData.userInfo.balance || 0) + r.depositRefundAmount });
              wx.showToast({ title: `已取消，定金 ¥${r.depositRefundAmount} 已退回余额`, icon: 'success' });
            } else {
              wx.showToast({ title: '已取消', icon: 'success' });
            }
            setTimeout(() => { this.fetchDetail(); }, 1200);
          } else {
            wx.showToast({ title: result.result.error || '取消失败', icon: 'none' });
          }
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      },
    });
  },
});
