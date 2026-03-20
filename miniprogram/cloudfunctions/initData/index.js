const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 初始化数据库基础数据（技师 + 商品）
 * ⚠️ 只需运行一次！在微信开发者工具的云函数面板中手动触发
 */

const TECHNICIANS = [
  {
    _id: 'tech_1',
    name: '小雅',
    title: '首席美甲师',
    rating: 4.9,
    reviews: 328,
    avatar: '🧑‍🎨',
    skills: ['日式凝胶', '高定款式', 'VIP 专属'],
    priceFrom: 300,
    desc: '擅长高定款式，精通日式凝胶与花卉彩绘，从业 8 年，深受客户喜爱。',
    available: true,
    badge: '热门',
    order: 1,
  },
  {
    _id: 'tech_2',
    name: '晓晓',
    title: '美睫专家',
    rating: 4.8,
    reviews: 256,
    avatar: '👩‍🎨',
    skills: ['嫁接睫毛', '种植睫毛', '韩式美睫'],
    priceFrom: 200,
    desc: '10 年美睫经验，擅长韩系自然风与影视妆感，嫁接技术精湛。',
    available: true,
    badge: '新品',
    order: 2,
  },
  {
    _id: 'tech_3',
    name: '芊芊',
    title: '高级美甲师',
    rating: 4.7,
    reviews: 198,
    avatar: '💁‍♀️',
    skills: ['光疗美甲', '手绘彩绘', '法式美甲'],
    priceFrom: 280,
    desc: '擅长彩绘与光疗，风格多变，可根据客人需求定制专属图案。',
    available: true,
    badge: '',
    order: 3,
  },
  {
    _id: 'tech_4',
    name: '可可',
    title: 'VIP 高定师',
    rating: 5.0,
    reviews: 89,
    avatar: '👸',
    skills: ['高定款式', 'VIP Room', '宝石镶嵌'],
    priceFrom: 1000,
    desc: '专注高定美甲，宝石镶嵌技术独树一帜，VIP Room 专属服务。',
    available: true,
    badge: 'VIP',
    order: 4,
  },
];

const PRODUCTS = [
  // 服务套餐 (type: package)
  {
    _id: 'pkg_1', type: 'package', name: '樱花限定美甲套餐', desc: '日式凝胶 · 春日主题',
    price: 299, points: null, tag: '热销', emoji: '🌸', sold: 128, stock: 999,
    serviceId: 1, duration: '90 分钟', durationMin: 90,
    techIds: ['tech_1', 'tech_3'],
    features: ['日式凝胶美甲（正片）', '春日主题定制设计', '甲面养护 + 抛光处理'],
  },
  {
    _id: 'pkg_2', type: 'package', name: '高级美睫套餐', desc: '嫁接睫毛 + 定妆',
    price: 399, points: null, tag: '新品', emoji: '👁️', sold: 56, stock: 999,
    serviceId: 3, duration: '90 分钟', durationMin: 90,
    techIds: ['tech_2'],
    features: ['嫁接睫毛（自然款 / 魅力款）', '定妆保形处理', '首次补毛免费'],
  },
  {
    _id: 'pkg_3', type: 'package', name: '美甲+美睫组合', desc: '双项优惠套餐',
    price: 599, points: null, tag: '优惠', emoji: '✨', sold: 89, stock: 999,
    serviceId: 5, duration: '180 分钟', durationMin: 180,
    techIds: ['tech_1', 'tech_2', 'tech_3'],
    features: ['日式凝胶美甲 + 嫁接睫毛', '双项同时或分次预约使用', '套餐专属优惠价格'],
  },
  {
    _id: 'pkg_4', type: 'package', name: 'VIP 高定全套', desc: 'VIP Room 专属 · 高定款',
    price: 1000, points: null, tag: 'VIP', emoji: '👸', sold: 23, stock: 999,
    serviceId: 6, duration: '240 分钟', durationMin: 240,
    techIds: ['tech_1', 'tech_4'],
    features: ['VIP 专属包间，全程私密', '高定款式 + 手工宝石镶嵌', '专属技师一对一全程陪护', '定制礼品袋赠送'],
  },
  // 积分兑换 (type: redeem)
  { _id: 'rdm_1', type: 'redeem', name: '猫爪造型发卡', desc: '宠物联名款 · 限量', price: null, points: 500, tag: '精选', emoji: '🐾', sold: 0, stock: 50 },
  { _id: 'rdm_2', type: 'redeem', name: '品牌定制徽章', desc: '第五季限定徽章', price: null, points: 800, tag: '限量', emoji: '🎀', sold: 0, stock: 30 },
  { _id: 'rdm_3', type: 'redeem', name: '护手霜礼盒套装', desc: '天然植物萃取', price: null, points: 1200, tag: '推荐', emoji: '🌸', sold: 0, stock: 20 },
  { _id: 'rdm_4', type: 'redeem', name: '第五季帆布袋', desc: '环保材质 · 联名设计', price: null, points: 600, tag: '新品', emoji: '🌿', sold: 0, stock: 40 },
  { _id: 'rdm_5', type: 'redeem', name: '美甲贴纸套装', desc: '原创设计 · 20 张装', price: null, points: 300, tag: '好评', emoji: '💅', sold: 0, stock: 100 },
  { _id: 'rdm_6', type: 'redeem', name: '美甲养护套装', desc: '专业护甲油 + 营养液', price: null, points: 400, tag: '实用', emoji: '💎', sold: 0, stock: 50 },
];

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (e) {
    // 集合已存在，忽略错误
  }
}

async function upsert(collection, docs) {
  await ensureCollection(collection);
  let updated = 0;
  for (const doc of docs) {
    const { _id, ...data } = doc;
    await db.collection(collection).doc(_id).set({ data });
    updated++;
  }
  return { updated };
}

// 确保所有运行时集合存在（不含 technicians/products，由下方 upsert 单独处理）
const ALL_COLLECTIONS = ['users', 'bookings', 'posts', 'comments', 'likes', 'pointsLogs', 'redemptions'];

exports.main = async (event, context) => {
  // 确保所有集合存在
  await Promise.all(ALL_COLLECTIONS.map(ensureCollection));

  const techResult     = await upsert('technicians', TECHNICIANS);
  const productResult  = await upsert('products', PRODUCTS);

  return {
    success: true,
    message: '初始化完成',
    technicians: techResult,
    products:    productResult,
  };
};
