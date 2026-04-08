// 一次性初始化脚本 — 清空并重建 serviceCategories + services 两个集合
// 在管理后台手动触发一次即可
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const CATEGORIES = [
  { _id: 'cat_pure',  name: '纯色系列',            order: 1 },
  { _id: 'cat_ext',   name: '延长系列',             order: 2 },
  { _id: 'cat_style', name: '美甲款式系列（带建构）', order: 3 },
  { _id: 'cat_foot',  name: '足部美甲',             order: 4 },
  { _id: 'cat_lash',  name: '美睫',                 order: 5 },
  { _id: 'cat_care',  name: '护理系列',             order: 6 },
  { _id: 'cat_basic', name: '基础系列',             order: 7 },
];

const SERVICES = [
  // ── 纯色系列 ───────────────────────────────────────────────
  { _id: 'svc_pure_01', categoryId: 'cat_pure', name: '精致纯色',               price: 298, durationMin: 60,  order: 1 },
  { _id: 'svc_pure_02', categoryId: 'cat_pure', name: '限定纯色',               price: 328, durationMin: 70,  order: 2 },
  { _id: 'svc_pure_03', categoryId: 'cat_pure', name: '柔嫩晶透纯色（素颜胶）', price: 328, durationMin: 75,  order: 3 },
  { _id: 'svc_pure_04', categoryId: 'cat_pure', name: '猫眼',                   price: 328, durationMin: 75,  order: 4 },
  { _id: 'svc_pure_05', categoryId: 'cat_pure', name: '碎钻胶',                 price: 328, durationMin: 90,  order: 5 },
  { _id: 'svc_pure_06', categoryId: 'cat_pure', name: '魔镜粉单色',             price: 328, durationMin: 70,  order: 6 },

  // ── 延长系列 ───────────────────────────────────────────────
  { _id: 'svc_ext_01', categoryId: 'cat_ext', name: '浅贴延长',                   price: 200, durationMin: 60,  order: 1 },
  { _id: 'svc_ext_02', categoryId: 'cat_ext', name: '甲膜延长（实色延长或款式延长）', price: 558, durationMin: 120, order: 2 },
  { _id: 'svc_ext_03', categoryId: 'cat_ext', name: '甲模裸透色延长单色',         price: 558, durationMin: 120, order: 3 },

  // ── 美甲款式系列（带建构）──────────────────────────────────
  { _id: 'svc_sty_01', categoryId: 'cat_style', name: '简约定制款',       price: 468, durationMin: 120, order: 1 },
  { _id: 'svc_sty_02', categoryId: 'cat_style', name: '轻奢复杂款',       price: 688, durationMin: 150, order: 2 },
  { _id: 'svc_sty_03', categoryId: 'cat_style', name: '个人高级定制款',   price: 888, durationMin: 180, order: 3 },

  // ── 足部美甲 ───────────────────────────────────────────────
  { _id: 'svc_foot_01', categoryId: 'cat_foot', name: '足部纯色', price: 328, durationMin: 60, order: 1 },
  { _id: 'svc_foot_02', categoryId: 'cat_foot', name: '足部款式', price: 388, durationMin: 90, order: 2 },

  // ── 美睫 ───────────────────────────────────────────────────
  { _id: 'svc_lash_01', categoryId: 'cat_lash', subgroup: '妈生系列', name: '轻盈单根',         price: 188, durationMin: 90,  order: 1 },
  { _id: 'svc_lash_02', categoryId: 'cat_lash', subgroup: '妈生系列', name: '婴儿弯',           price: 208, durationMin: 100, order: 2 },
  { _id: 'svc_lash_03', categoryId: 'cat_lash', subgroup: '妈生系列', name: '婴儿直',           price: 208, durationMin: 100, order: 3 },
  { _id: 'svc_lash_04', categoryId: 'cat_lash', subgroup: '妈生系列', name: '下睫毛',           price: 98,  durationMin: 30,  order: 4 },
  { _id: 'svc_lash_05', categoryId: 'cat_lash', subgroup: '网红系列', name: '网红系列（报价制）', price: 318, durationMin: 120, isQuote: true, order: 5 },

  // ── 护理系列 ───────────────────────────────────────────────
  { _id: 'svc_care_01', categoryId: 'cat_care', name: '手部护理', price: 128, durationMin: 40, order: 1 },
  { _id: 'svc_care_02', categoryId: 'cat_care', name: '高端手护', price: 298, durationMin: 60, order: 2 },
  { _id: 'svc_care_03', categoryId: 'cat_care', name: '足部护理', price: 358, durationMin: 60, order: 3 },

  // ── 基础系列 ───────────────────────────────────────────────
  { _id: 'svc_base_01', categoryId: 'cat_basic', name: '精致修手', price: 68, durationMin: 20, order: 1 },
  { _id: 'svc_base_02', categoryId: 'cat_basic', name: '本甲修补', price: 50, durationMin: 20, order: 2 },
  { _id: 'svc_base_03', categoryId: 'cat_basic', name: '本甲卸甲', price: 68, durationMin: 30, order: 3 },
  { _id: 'svc_base_04', categoryId: 'cat_basic', name: '延长卸甲', price: 88, durationMin: 40, order: 4 },
];

exports.main = async (event, context) => {
  // 一次性初始化脚本，无需鉴权——直接在 DevTools 手动触发一次即可
  try {
    // 确保集合存在
    for (const col of ['serviceCategories', 'services']) {
      try { await db.createCollection(col); } catch (_) {}
    }

    // 清空旧数据
    const delCats = await db.collection('serviceCategories').get();
    for (const d of delCats.data) await db.collection('serviceCategories').doc(d._id).remove();

    const delSvcs = await db.collection('services').get();
    for (const d of delSvcs.data) await db.collection('services').doc(d._id).remove();

    // 写入分类
    for (const cat of CATEGORIES) {
      await db.collection('serviceCategories').add({ data: { ...cat } });
    }

    // 写入服务
    for (const svc of SERVICES) {
      const doc = {
        categoryId:  svc.categoryId,
        name:        svc.name,
        price:       svc.price,
        durationMin: svc.durationMin,
        order:       svc.order,
        isQuote:     svc.isQuote || false,
        subgroup:    svc.subgroup || '',
      };
      await db.collection('services').add({ data: { ...doc } });
    }

    return { success: true, categories: CATEGORIES.length, services: SERVICES.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
