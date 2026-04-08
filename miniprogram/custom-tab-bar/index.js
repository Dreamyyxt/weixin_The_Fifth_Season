Component({
  data: {
    selected: 0,
    list: [
      { text: '首页',  icon: '⌂' },
      { text: '商城',  icon: '🛍' },
      { text: '预约',  icon: '💅', center: true },
      { text: '社区',  icon: '✦' },
      { text: '我的',  icon: '◎' },
    ],
  },
  methods: {
    switchTo(e) {
      const index = parseInt(e.currentTarget.dataset.index);
      const urls = [
        '/pages/index/index',
        '/pages/shop/index',
        '/pages/booking-tab/index',
        '/pages/community/index',
        '/pages/profile/index',
      ];
      // 预约 tab：无论是否已在该页，都强制重置 session
      if (index === 2) {
        const pages = getCurrentPages();
        const cur = pages[pages.length - 1];
        if (cur && cur.route === 'pages/booking-tab/index') {
          cur._resetSession && cur._resetSession();
          return;
        }
      }
      wx.switchTab({ url: urls[index] });
    },
  },
});
