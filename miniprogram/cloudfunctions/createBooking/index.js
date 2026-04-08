const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;


/**
 * 创建预约
 * event: { techId, techName, serviceName, serviceId, date, time, price,
 *          discountRate, duration, name, phone, remark }
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { techId, techName, serviceName, serviceId, serviceIds, date, time, price,
          discountRate,
          duration, durationMin, name, phone, remark,
          depositRequired, depositAmount } = event;

  const missing = [];
  if (!date)        missing.push('date');
  if (!time)        missing.push('time');
  if (!serviceName) missing.push('serviceName');
  if (!name)        missing.push('name');
  if (!phone)       missing.push('phone');
  if (missing.length) {
    console.error('createBooking: missing fields:', missing, 'event:', JSON.stringify(event));
    return { success: false, error: `缺少必要参数: ${missing.join(', ')}` };
  }

  const booking = {
    _openid:     OPENID,
    userId:      OPENID,
    techId,
    techName,
    serviceName,
    serviceId,
    serviceIds:  serviceIds || [serviceId],
    date,
    time,
    price,
    discountRate: discountRate || 1.0,
    duration,
    durationMin: durationMin || 60,
    name,
    phone,
    remark:      remark || '',
    status:      'pending',
    depositRequired: depositRequired || false,
    depositAmount:   depositRequired ? (depositAmount || 0) : 0,
    depositStatus:   depositRequired ? 'pending' : 'none',
    createdAt:   db.serverDate(),
  };

  const result = await db.collection('bookings').add({ data: booking });

  // 仅更新预约次数（累计消费和积分在付款完成时更新，不在提交预约时更新）
  try {
    await db.collection('users').doc(OPENID).update({
      data: { bookingCount: _.inc(1) },
    });
  } catch (e) {
    console.warn('createBooking: failed to increment bookingCount for', OPENID, e.message);
  }

  return {
    success:   true,
    bookingId: result._id,
  };
};
