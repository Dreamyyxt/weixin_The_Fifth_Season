const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  let caller;
  try {
    const res = await db.collection('users').doc(OPENID).get();
    caller = res.data;
  } catch (e) {
    return { success: false, error: '用户不存在' };
  }
  if (caller.role !== 'admin' && caller.role !== 'technician') {
    return { success: false, error: '无权限' };
  }

  const { guestName, guestPhone, techId, techName, serviceName, serviceId,
          date, time, price, durationMin, duration, remark, source } = event;

  if (!techId || !serviceName || !date || !time) {
    return { success: false, error: '请填写完整预约信息' };
  }

  // Tech can only create bookings for themselves
  if (caller.role === 'technician' && caller.linkedTechId && caller.linkedTechId !== techId) {
    return { success: false, error: '技师只能为自己创建预约' };
  }

  const booking = {
    userId:       '',
    isGuest:      true,
    guestSource:  source || 'other',
    name:         guestName || '散客',
    phone:        guestPhone || '',
    techId,
    techName:     techName || '',
    serviceName,
    serviceId:    serviceId || null,
    serviceIds:   serviceId ? [serviceId] : [],
    date,
    time,
    price:        price || 0,
    finalPrice:   price || 0,
    durationMin:  durationMin || 60,
    duration:     duration || '',
    remark:       remark || '',
    status:       'confirmed',
    paymentStatus: 'unpaid',
    depositRequired: false,
    depositAmount:   0,
    depositStatus:   'none',
    createdAt:    db.serverDate(),
    createdBy:    OPENID,
  };

  try {
    const result = await db.collection('bookings').add({ data: booking });
    return { success: true, bookingId: result._id };
  } catch (e) {
    return { success: false, error: '创建失败' };
  }
};
