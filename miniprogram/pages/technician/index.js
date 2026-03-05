Page({
  data: {
    technicians: [
      {
        id: 1,
        name: '小雅',
        title: '首席美甲师',
        rating: 4.9,
        ratingText: '4.9',
        reviews: 328,
        avatar: '🧑‍🎨',
        skills: ['日式凝胶', '高定款式', 'VIP 专属'],
        priceFrom: 300,
        desc: '擅长高定款式，精通日式凝胶与花卉彩绘，从业 8 年，深受客户喜爱。',
        available: true,
        badge: '热门',
      },
      {
        id: 2,
        name: '晓晓',
        title: '美睫专家',
        rating: 4.8,
        ratingText: '4.8',
        reviews: 256,
        avatar: '👩‍🎨',
        skills: ['嫁接睫毛', '种植睫毛', '韩式美睫'],
        priceFrom: 200,
        desc: '10 年美睫经验，擅长韩系自然风与影视妆感，嫁接技术精湛。',
        available: true,
        badge: '新品',
      },
      {
        id: 3,
        name: '芊芊',
        title: '高级美甲师',
        rating: 4.7,
        ratingText: '4.7',
        reviews: 198,
        avatar: '💁‍♀️',
        skills: ['光疗美甲', '手绘彩绘', '法式美甲'],
        priceFrom: 280,
        desc: '擅长彩绘与光疗，风格多变，可根据客人需求定制专属图案。',
        available: false,
        badge: '',
      },
      {
        id: 4,
        name: '可可',
        title: 'VIP 高定师',
        rating: 5.0,
        ratingText: '5.0',
        reviews: 89,
        avatar: '👸',
        skills: ['高定款式', 'VIP Room', '宝石镶嵌'],
        priceFrom: 1000,
        desc: '专注高定美甲，宝石镶嵌技术独树一帜，VIP Room 专属服务。',
        available: true,
        badge: 'VIP',
      },
    ],
  },

  goBooking(e) {
    const techId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/booking/index?techId=${techId}`,
    });
  },
});
