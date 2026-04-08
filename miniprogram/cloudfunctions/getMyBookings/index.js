const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// Returns all bookings for the calling user (queries by userId, bypassing _openid filter)
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  const allBookings = [];
  let skip = 0;
  while (true) {
    const res = await db.collection('bookings')
      .where({ userId: OPENID })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(100)
      .get();
    if (!res.data || res.data.length === 0) break;
    allBookings.push(...res.data);
    if (res.data.length < 100) break;
    skip += 100;
  }

  return { success: true, bookings: allBookings };
};
