const app = getApp();
const { MEMBER_TIERS, calcTier } = require('../../utils/memberTiers');

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
    userInfo: {},
    bookingRecords: [],
    pointsLogs: [],
    activeSection: 'booking',
    loadingBookings: false,
    loadingLogs: false,
    quoteRecords: [],
    loadingQuotes: false,
    showSpendSheet: false,
    showTopupSheet: false,
    topupLogs: [],
    spendHistoryAll:   [],
    spendHistoryPage:  1,
    spendHistoryTotalPages: 1,
    spendHistoryDisplay: [],
    // 会员等级展示
    cardStyle: `background: ${MEMBER_TIERS[0].cardBg}`,
    currentTier: MEMBER_TIERS[0],
    nextTier: MEMBER_TIERS[1],
    tierProgress: 0,
    nextTierGap: 500,
    currentTierBenefits: MEMBER_TIERS[0].benefits,
    memberTiersDisplay: MEMBER_TIERS.map(t => ({
      level:        t.level,
      name:         t.name,
      discountText: t.discountText,
      minSpendText: t.minSpendText,
    })),
  },

  onShow() {
    this.setData({ userInfo: app.globalData.userInfo });
    this.calcTierDisplay();
    this.refreshUserInfo();
    this.fetchBookings();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
  },

  async refreshUserInfo() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getMyProfile' });
      if (res.result && res.result.success) {
        app.saveUserInfo(res.result.userInfo);
        this.setData({ userInfo: { ...app.globalData.userInfo } });
        this.calcTierDisplay();
      }
    } catch (e) {
      console.error('refreshUserInfo failed:', e);
    }
  },

  calcTierDisplay() {
    // 会员等级由「余额 + 累计消费」共同决定
    const tierBase = (this.data.userInfo.totalSpend || 0) + (this.data.userInfo.balance || 0);
    const currentTier = calcTier(tierBase);
    const nextIdx     = currentTier.level + 1;
    const nextTier    = nextIdx < MEMBER_TIERS.length ? MEMBER_TIERS[nextIdx] : null;

    let tierProgress = 100;
    let nextTierGap  = 0;
    if (nextTier) {
      const range   = nextTier.minSpend - currentTier.minSpend;
      const done    = tierBase - currentTier.minSpend;
      tierProgress  = Math.min(99, Math.round(done / range * 100));
      nextTierGap   = nextTier.minSpend - tierBase;
    }

    this.setData({
      currentTier,
      nextTier,
      tierProgress,
      nextTierGap,
      cardStyle:           `background: ${currentTier.cardBg}`,
      currentTierBenefits: currentTier.benefits,
    });
  },

  async fetchBookings() {
    this.setData({ loadingBookings: true });
    try {
      const METHOD_LABELS = {
        balance:         '余额支付',
        wechat:          '微信支付',
        cash:            '现金',
        card:            '刷卡',
        alipay_offline:  '支付宝',
      };

      const result = await wx.cloud.callFunction({ name: 'getMyBookings' });
      const raw = (result.result.success ? result.result.bookings : []);

      const records = raw.map(item => {
        let status, statusLabel;
        switch (item.status) {
          case 'cancelled':
            status = 'cancelled'; statusLabel = '已取消'; break;
          case 'completed':
            if (item.paymentStatus === 'paid') {
              status = 'done'; statusLabel = '已完成';
            } else {
              status = 'unpaid'; statusLabel = '待付款';
            }
            break;
          case 'confirmed':
            status = 'confirmed'; statusLabel = '预约已确认'; break;
          default:
            status = 'pending'; statusLabel = '预约待确认'; break;
        }
        return {
          _id:               item._id,
          tech:              item.techName,
          service:           item.serviceName,
          date:              item.date,
          time:              item.time,
          status,
          statusLabel,
          price:             item.price,
          finalPrice:        item.finalPrice,
          paymentStatus:     item.paymentStatus || 'unpaid',
          paymentMethod:     item.paymentMethod || '',
          paymentMethodLabel: METHOD_LABELS[item.paymentMethod] || '',
          duration:          item.duration,
          remark:            item.remark,
          techId:            item.techId || '',
          serviceId:         item.serviceId || '',
          quoteId:           item.quoteId  || '',
          depositRequired:   item.depositRequired || false,
          depositAmount:     item.depositAmount   || 0,
          depositStatus:     item.depositStatus   || 'none',
          createdAt:         item.createdAt,
        };
      });

      // Fetch pending/quoted quotes and prepend as chain-starters
      let quoteEntries = [];
      try {
        const qRes = await wx.cloud.callFunction({ name: 'getMyQuotes' });
        quoteEntries = (qRes.result.quotes || [])
          .filter(q => q.status === 'pending' || q.status === 'quoted' || q.status === 'rejected')
          .map(q => ({
            _id:         q._id,
            _type:       'quote',
            service:     q.mainService || '报价申请',
            tech:        q.recommendedTechName || '技师待分配',
            date:        q.preferredDate || '',
            time:        '',
            status:      q.status === 'pending' ? 'quote-pending'
                       : q.status === 'quoted'  ? 'quote-quoted'
                       :                          'quote-rejected',
            statusLabel: q.status === 'pending'  ? '等待报价'
                       : q.status === 'quoted'   ? '已报价'
                       :                           '已放弃',
            price:           q.price || 0,
            durationDisplay: minToDisplay(q.durationMin),
            firstImage:      (q.images || [])[0] || '',
            adminNote:       q.adminNote || '',
            createdAt:       q.createdAt,
          }));
      } catch (e) {
        console.error('fetchQuotes in fetchBookings:', e);
      }

      const allRecords = [...quoteEntries, ...records].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

      // Build spend history (completed+paid only), paginated
      const spendAll = records.filter(r => r.status === 'done');
      const spendTotalPages = Math.max(1, Math.ceil(spendAll.length / 10));

      this.setData({
        bookingRecords:         allRecords,
        spendHistoryAll:        spendAll,
        spendHistoryPage:       1,
        spendHistoryTotalPages: spendTotalPages,
        spendHistoryDisplay:    spendAll.slice(0, 10),
      });
    } catch (e) {
      console.error('fetchBookings:', e);
    } finally {
      this.setData({ loadingBookings: false });
    }
  },

  _spendSetPage(page) {
    const all = this.data.spendHistoryAll;
    const total = this.data.spendHistoryTotalPages;
    if (page < 1 || page > total) return;
    this.setData({
      spendHistoryPage:    page,
      spendHistoryDisplay: all.slice((page - 1) * 10, page * 10),
    });
  },

  spendHistoryPrev() { this._spendSetPage(this.data.spendHistoryPage - 1); },
  spendHistoryNext() { this._spendSetPage(this.data.spendHistoryPage + 1); },

  async fetchPointsLogs() {
    this.setData({ loadingLogs: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('pointsLogs')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      // Exclude topup records — topups have no points reward
      const logs = res.data
        .filter(item => item.type !== 'topup')
        .map(item => ({
          ...item,
          points: item.type === 'earn' ? `+${item.points}` : `${item.points}`,
          time:   this.formatLogTime(item.createdAt),
        }));
      this.setData({ pointsLogs: logs });
    } catch (e) {
      console.error('fetchPointsLogs:', e);
    } finally {
      this.setData({ loadingLogs: false });
    }
  },

  async openTopupHistory() {
    this.setData({ showTopupSheet: true, topupLogs: [] });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('pointsLogs')
        .where({ type: 'topup' })
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
      const logs = res.data.map(item => ({
        _id:    item._id,
        amount: item.amount || 0,
        time:   this.formatLogTime(item.createdAt),
      }));
      this.setData({ topupLogs: logs });
    } catch (e) {
      console.error('openTopupHistory:', e);
    }
  },

  closeTopupSheet() { this.setData({ showTopupSheet: false }); },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  formatLogTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/login/index?mode=edit' });
  },

  switchSection(e) {
    const sec = e.currentTarget.dataset.sec;
    this.setData({ activeSection: sec });
    if (sec === 'points') this.fetchPointsLogs();
  },

  showBenefits() {
    this.setData({ activeSection: 'benefits' });
  },

  openSpendHistory() {
    this.setData({ showSpendSheet: true });
  },

  closeSpendSheet() {
    this.setData({ showSpendSheet: false });
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/index?mode=admin' });
  },

  goTechWorkbench() {
    wx.navigateTo({ url: '/pages/admin/index?mode=technician' });
  },

  goBook() {
    wx.switchTab({ url: '/pages/booking-tab/index' });
  },

  goShop() {
    wx.switchTab({ url: '/pages/shop/index' });
  },

  showRecharge() {
    wx.showActionSheet({
      itemList: ['充值 ¥100', '充值 ¥300', '充值 ¥500', '充值 ¥1,000'],
      success: (res) => {
        const amounts = [100, 300, 500, 1000];
        this.doRecharge(amounts[res.tapIndex]);
      },
    });
  },

  async doRecharge(amount) {
    wx.showLoading({ title: '充值中...' });
    try {
      const result = await wx.cloud.callFunction({
        name: 'topUp',
        data: { amount },
      });
      wx.hideLoading();
      if (result.result.success) {
        const { newBalance, newTotalTopUp, newTierLevel, newTierName, tierUpgraded, oldTierName } = result.result;
        app.saveUserInfo({ balance: newBalance, totalTopUp: newTotalTopUp, vipLevel: newTierName, memberLevel: newTierLevel });
        this.setData({ userInfo: app.globalData.userInfo });
        this.calcTierDisplay();
        if (tierUpgraded) {
          wx.showModal({
            title: '会员升级！',
            content: `恭喜您从 ${oldTierName} 升级为 ${newTierName}！\n\n新权益已即时生效。`,
            showCancel: false,
            confirmText: '查看权益',
            success: () => this.setData({ activeSection: 'benefits' }),
          });
        } else {
          wx.showToast({ title: `充值成功 ¥${amount}`, icon: 'success' });
        }
      } else {
        wx.showToast({ title: result.result.error || '充值失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    }
  },

  async fetchQuotes() {
    this.setData({ loadingQuotes: true });
    try {
      const STATUS_LABELS = { pending: '等待报价', quoted: '已报价', confirmed: '已预约', rejected: '已取消' };
      const res = await wx.cloud.callFunction({ name: 'getMyQuotes' });
      const quotes = (res.result.quotes || []).map(q => ({
        _id:        q._id,
        images:     q.images || [],
        firstImage: (q.images || [])[0] || '',
        status:     q.status || 'pending',
        statusLabel: STATUS_LABELS[q.status] || '等待报价',
        price:      q.price,
        techName:   q.techName || '',
        adminNote:  q.adminNote || '',
        createdAt:  q.createdAt,
        preferredDate: q.preferredDate || '',
        recommendedTechId: q.recommendedTechId || '',
      }));
      this.setData({ quoteRecords: quotes });
    } catch (e) {
      console.error('fetchQuotes:', e);
    } finally {
      this.setData({ loadingQuotes: false });
    }
  },

  goQuoteDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/quote-detail/index?id=${id}` });
  },

  reBook(e) {
    const { techid, serviceid, quoteid } = e.currentTarget.dataset;
    // Quote-origin booking: re-submit a new quote (pre-fill tech if known)
    if (quoteid || !serviceid) {
      const url = techid
        ? `/pages/quote/index?techId=${techid}`
        : '/pages/quote/index';
      wx.navigateTo({ url });
      return;
    }
    // Regular booking: pre-select both tech and service
    app.globalData.pendingBooking = { techId: techid, serviceId: serviceid };
    wx.switchTab({ url: '/pages/booking-tab/index' });
  },

  goBookingDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/profile/booking-detail/index?id=${id}` });
  },

  cancelBooking(e) {
    const bookingId = e.currentTarget.dataset.id;
    const booking = this.data.bookingRecords.find(b => b._id === bookingId);
    if (!booking) return;

    const isConfirmed = booking.status === 'confirmed';
    const willForfeit = isConfirmed && booking.depositRequired &&
      booking.depositStatus !== 'none' && booking.depositStatus !== 'forfeited';
    const baseInfo = `服务：${booking.service}\n技师：${booking.tech}\n时间：${booking.date} ${booking.time}`;
    const content = willForfeit
      ? `此预约已由技师确认，取消后定金 ¥${booking.depositAmount} 将不予退还。\n\n${baseInfo}`
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
            data: { bookingId },
          });
          wx.hideLoading();
          if (result.result.success) {
            wx.showToast({ title: '已取消', icon: 'success' });
            this.fetchBookings();
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
