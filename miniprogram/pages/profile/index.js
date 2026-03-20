const app = getApp();
const { MEMBER_TIERS, calcTier } = require('../../utils/memberTiers');

Page({
  data: {
    userInfo: {},
    bookingRecords: [],
    pointsLogs: [],
    activeSection: 'booking',
    loadingBookings: false,
    loadingLogs: false,
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
  },

  async refreshUserInfo() {
    try {
      const db = wx.cloud.database();
      // where({}) 自动按当前用户 _openid 过滤，无需依赖 globalData.openId 字段
      const res = await db.collection('users').where({}).get();
      if (res.data && res.data.length > 0) {
        app.saveUserInfo(res.data[0]);
        this.setData({ userInfo: app.globalData.userInfo });
        this.calcTierDisplay();
      }
    } catch (e) {
      // 静默失败，使用缓存数据
    }
  },

  calcTierDisplay() {
    // 会员等级由 累计消费 + 累计充值 共同决定
    const totalSpend  = this.data.userInfo.totalSpend || 0;
    const totalTopUp  = this.data.userInfo.totalTopUp || 0;
    const tierBase    = totalSpend + totalTopUp;
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
      const db = wx.cloud.database();
      const res = await db.collection('bookings')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const records = res.data.map(item => {
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
          _id:             item._id,
          tech:            item.techName,
          service:         item.serviceName,
          date:            item.date,
          time:            item.time,
          status,
          statusLabel,
          price:           item.price,
          finalPrice:      item.finalPrice,
          paymentStatus:   item.paymentStatus || 'unpaid',
          duration:        item.duration,
          remark:          item.remark,
          depositRequired: item.depositRequired || false,
          depositAmount:   item.depositAmount   || 0,
          depositStatus:   item.depositStatus   || 'none',
        };
      });
      this.setData({ bookingRecords: records });
    } catch (e) {
      console.error('fetchBookings:', e);
    } finally {
      this.setData({ loadingBookings: false });
    }
  },

  async fetchPointsLogs() {
    this.setData({ loadingLogs: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('pointsLogs')
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get();

      const logs = res.data.map(item => ({
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
    if (sec === 'points') {
      this.fetchPointsLogs();
    }
  },

  showBenefits() {
    this.setData({ activeSection: 'benefits' });
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/index?mode=admin' });
  },

  goTechWorkbench() {
    wx.navigateTo({ url: '/pages/admin/index?mode=technician' });
  },

  goBook() {
    wx.switchTab({ url: '/pages/technician/index' });
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
