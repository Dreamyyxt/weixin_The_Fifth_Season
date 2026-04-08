const { statusBarHeight } = wx.getWindowInfo();
const NAV_TOP = statusBarHeight + 12;

Page({
  data: {
    navTopPadding: NAV_TOP,
    isNew: true,
    pkgId: '',
    technicians: [],
    selectedTechIds: [],
    selectedTechIdsMap: {},
    featureInput: '',
    features: [],
    form: {
      type: 'service',
      name: '', desc: '', image: '', tag: '',
      price: '', points: '', stock: '999',
      duration: '', durationMin: '', order: '',
      isVip: false,
    },
    saving: false,
  },

  async onLoad(options) {
    // Load technician list for techId multi-select
    try {
      const db = wx.cloud.database();
      const res = await db.collection('technicians').orderBy('order', 'asc').get();
      this.setData({ technicians: res.data });
    } catch (e) {}

    if (options.id) {
      this.setData({ isNew: false, pkgId: options.id });
      this.loadPkg(options.id);
    } else if (options.type) {
      this.setData({ 'form.type': options.type });
    }
  },

  async loadPkg(id) {
    wx.showLoading({ title: '加载中...' });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('products').doc(id).get();
      const p = res.data;
      this.setData({
        form: {
          type:        p.type || 'service',
          name:        p.name || '',
          desc:        p.desc || '',
          image:       p.image || '',
          tag:         p.tag || '',
          price:       p.price != null ? String(p.price) : '',
          points:      p.points != null ? String(p.points) : '',
          stock:       p.stock != null ? String(p.stock) : '999',
          duration:    p.duration || '',
          durationMin: p.durationMin != null ? String(p.durationMin) : '',
          order:       p.order != null ? String(p.order) : '',
          isVip:       p.isVip || false,
        },
        selectedTechIds: p.techIds || [],
        selectedTechIdsMap: Object.fromEntries((p.techIds || []).map(id => [id, true])),
        features: p.features || [],
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async chooseImage() {
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'] });
      const tempPath = res.tempFiles[0].tempFilePath;
      wx.showLoading({ title: '上传中...' });
      const cloudPath = `products/img_${Date.now()}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
      wx.hideLoading();
      this.setData({ 'form.image': uploadRes.fileID });
    } catch (e) {
      wx.hideLoading();
      if (e.errMsg && !e.errMsg.includes('cancel')) {
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  toggleIsVip() {
    this.setData({ 'form.isVip': !this.data.form.isVip });
  },

  toggleTechId(e) {
    const techId = e.currentTarget.dataset.id;
    const selected = this.data.selectedTechIds;
    const newSelected = selected.includes(techId)
      ? selected.filter(t => t !== techId)
      : [...selected, techId];
    const newMap = Object.fromEntries(newSelected.map(id => [id, true]));
    this.setData({ selectedTechIds: newSelected, selectedTechIdsMap: newMap });
  },

  onFeatureInput(e) {
    this.setData({ featureInput: e.detail.value });
  },

  addFeature() {
    const s = this.data.featureInput.trim();
    if (!s) return;
    this.setData({ features: [...this.data.features, s], featureInput: '' });
  },

  removeFeature(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ features: this.data.features.filter((_, i) => i !== idx) });
  },

  async save() {
    const { form, selectedTechIds, features, pkgId, isNew } = this.data;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入套餐名称', icon: 'none' }); return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    try {
      const pkg = {
        type:  form.type,
        name:  form.name.trim(),
        desc:  form.desc.trim(),
        image: form.image,
        tag:   form.tag.trim(),
        stock: Number(form.stock) || 999,
        order: Number(form.order) || 0,
      };
      if (form.type === 'service') {
        pkg.price       = Number(form.price) || 0;
        pkg.duration    = form.duration.trim();
        pkg.durationMin = Number(form.durationMin) || 0;
        pkg.isVip       = form.isVip || false;
        pkg.techIds     = selectedTechIds;
      } else if (form.type === 'package') {
        pkg.price       = Number(form.price) || 0;
        pkg.duration    = form.duration.trim();
        pkg.durationMin = Number(form.durationMin) || 0;
        pkg.techIds     = selectedTechIds;
        pkg.features    = features;
      } else {
        pkg.points = Number(form.points) || 0;
      }
      if (!isNew) pkg._id = pkgId;

      const result = await wx.cloud.callFunction({
        name: 'adminManagePkg',
        data: { action: 'save', pkg },
      });
      wx.hideLoading();
      if (result.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        wx.showToast({ title: result.result.error || '保存失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  goBack() { wx.navigateBack(); },
});
