const MEMBER_TIERS = [
  {
    level: 0,
    name: '普通会员',
    minSpend: 0,
    discount: 1.0,
    discountText: '无折扣',
    minSpendText: '—',
    cardBg: 'linear-gradient(135deg, #3D3228, #5A4A3C)',
    accentColor: '#C9A76B',
    benefits: ['预约任意技师', '积分消费累计'],
    // perks: 代码可读取的权益标志，benefits 数组仅用于 UI 展示
    // 新增权益时在此添加字段，不需要改动调用方
    perks: {
      noVipAdvanceLimit: false,  // 不受 VIP 服务提前预约限制
      priorityBooking:   false,  // 优先预约通道
    },
  },
  {
    level: 1,
    name: '银卡会员',
    minSpend: 500,
    discount: 0.95,
    discountText: '9.5折',
    minSpendText: '¥500',
    cardBg: 'linear-gradient(135deg, #4A5060, #7A8898)',
    accentColor: '#C8D0DC',
    benefits: ['全场9.5折优惠', '积分2倍累计'],
    perks: {
      noVipAdvanceLimit: false,
      priorityBooking:   false,
    },
  },
  {
    level: 2,
    name: '金卡会员',
    minSpend: 2000,
    discount: 0.90,
    discountText: '9折',
    minSpendText: '¥2,000',
    cardBg: 'linear-gradient(135deg, #6A4810, #B88840)',
    accentColor: '#F0C060',
    benefits: ['全场9折优惠', '生日当月赠去甲1次', '积分3倍累计'],
    perks: {
      noVipAdvanceLimit: false,
      priorityBooking:   false,
    },
  },
  {
    level: 3,
    name: '铂金会员',
    minSpend: 5000,
    discount: 0.88,
    discountText: '8.8折',
    minSpendText: '¥5,000',
    cardBg: 'linear-gradient(135deg, #385868, #6A98B0)',
    accentColor: '#B8D8E8',
    benefits: ['全场8.8折优惠', '优先预约通道', '生日当月赠嫁接睫毛1次', '积分4倍累计'],
    perks: {
      noVipAdvanceLimit: false,
      priorityBooking:   true,
    },
  },
  {
    level: 4,
    name: '黑金会员',
    minSpend: 10000,
    discount: 0.85,
    discountText: '8.5折',
    minSpendText: '¥10,000',
    cardBg: 'linear-gradient(135deg, #181410, #302818)',
    accentColor: '#C8980C',
    benefits: ['全场8.5折优惠', '每月赠去甲1次', '专属客服', '积分5倍累计'],
    perks: {
      noVipAdvanceLimit: false,
      priorityBooking:   true,
    },
  },
  {
    level: 5,
    name: '钻石会员',
    minSpend: 20000,
    discount: 0.80,
    discountText: '8折',
    minSpendText: '¥20,000',
    cardBg: 'linear-gradient(135deg, #20104A, #5830A8)',
    accentColor: '#B890FF',
    benefits: ['全场8折优惠', '每月赠去甲2次', 'VIP专属技师', '不受提前预约时间限制', '积分6倍累计'],
    perks: {
      noVipAdvanceLimit: true,   // 钻石会员不受 VIP 服务3天提前预约限制
      priorityBooking:   true,
    },
  },
];

function calcTier(totalSpend) {
  let tier = MEMBER_TIERS[0];
  for (const t of MEMBER_TIERS) {
    if ((totalSpend || 0) >= t.minSpend) tier = t;
  }
  return tier;
}

module.exports = { MEMBER_TIERS, calcTier };
