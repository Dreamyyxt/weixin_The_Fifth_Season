const app = getApp();

// 最短项目时长（用于判断是否有足够空闲时间）- 90 分钟
const MIN_SERVICE_DURATION = 90;

// 时间槽间隔（分钟）
const TIME_SLOT_INTERVAL = 30;

// 营业时间范围
const OPENING_HOUR = 10; // 10:00
const CLOSING_HOUR = 17; // 17:00

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
        available: true,
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
    today: '',
  },

  onLoad() {
    // 设置今天日期
    this.setData({ today: this.formatDate(new Date()) });
  },

  onShow() {
    // 每次显示页面时重新检查技师可约状态
    this.updateTechniciansAvailability();
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  // 更新所有技师的可约状态
  updateTechniciansAvailability() {
    const { technicians, today } = this.data;
    const updatedTechs = technicians.map(tech => {
      const isAvailable = this.checkTechnicianAvailable(tech.id, today);
      return { ...tech, available: isAvailable };
    });
    this.setData({ technicians: updatedTechs });
  },

  // 检查技师今天是否可约
  checkTechnicianAvailable(techId, date) {
    // 获取技师当天已预约的时间段
    const bookedSlots = app.getBookedSlots(techId, date);
    
    // 如果没有预约记录，默认可约
    if (bookedSlots.length === 0) {
      return true;
    }

    // 生成当天所有可用时间槽（分钟数表示）
    const allSlots = [];
    for (let h = OPENING_HOUR; h < CLOSING_HOUR; h++) {
      allSlots.push(h * 60);        // :00
      allSlots.push(h * 60 + 30);   // :30
    }
    // 加上最后一个时间点 17:00
    allSlots.push(CLOSING_HOUR * 60);

    // 将已预约时间转换为分钟数集合
    const bookedMinutes = new Set();
    bookedSlots.forEach(timeStr => {
      bookedMinutes.add(app.timeToMinutes(timeStr));
    });

    // 找出所有空闲时间槽
    const freeSlots = allSlots.filter(minutes => !bookedMinutes.has(minutes));

    // 如果没有空闲时间，不可约
    if (freeSlots.length === 0) {
      return false;
    }

    // 检查是否有连贯的空闲时间 >= 最短项目时长
    // 连贯空闲时间 = 连续的空闲时间槽数量 * 30 分钟
    let maxConsecutiveFree = 0;
    let currentConsecutiveFree = 0;
    let prevMinutes = -1;

    for (const minutes of freeSlots) {
      if (prevMinutes === -1 || minutes === prevMinutes + TIME_SLOT_INTERVAL) {
        // 连续的时间槽
        currentConsecutiveFree++;
      } else {
        // 时间槽断开，重置计数
        maxConsecutiveFree = Math.max(maxConsecutiveFree, currentConsecutiveFree);
        currentConsecutiveFree = 1;
      }
      prevMinutes = minutes;
    }
    // 最后一次比较
    maxConsecutiveFree = Math.max(maxConsecutiveFree, currentConsecutiveFree);

    // 计算最大连贯空闲时长（分钟）
    const maxConsecutiveDuration = (maxConsecutiveFree - 1) * TIME_SLOT_INTERVAL;

    // 如果最大连贯空闲时间 >= 最短项目时长，则可约
    return maxConsecutiveDuration >= MIN_SERVICE_DURATION;
  },

  goBooking(e) {
    const techId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/booking/index?techId=${techId}`,
    });
  },
});
