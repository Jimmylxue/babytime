#!/usr/bin/env node
/**
 * 家庭成员昵称（备注名）本地自检脚本
 *
 * 解决的问题：本地只有一个微信号，没法真的邀请第二个用户，但「改成员昵称」只依赖
 *            一条 family_members 记录，所以造一个「假家人」就能完整走通并验证接口。
 *
 * 用法（在仓库根目录或 apps/server 下都可以跑）：
 *   node apps/server/scripts/family-nickname-check.js          # 造数据 + 全链路自检
 *   node apps/server/scripts/family-nickname-check.js seed     # 只造测试数据
 *   node apps/server/scripts/family-nickname-check.js check    # 只跑接口自检
 *   node apps/server/scripts/family-nickname-check.js clean    # 清理测试数据
 *
 * 可选参数：
 *   --owner=<userId>   指定家庭创建者（默认取「最近建过宝宝」的用户）
 *   --baby=<babyId>    指定挂在哪个宝宝下（默认取创建者最新建的宝宝）
 *   --api=<url>        接口地址（默认读 .env 的 API_BASE_URL）
 *
 * 只依赖 apps/server 已装的 mysql2，不额外装包；JWT 用 node crypto 自签。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SEED_OPEN_ID = 'local_seed_family_member';
const SEED_USER_NAME = '测试家人';
const SEED_REMARK = '宝爸（备注测试）';

// ---------- 基础工具 ----------

function loadEnv() {
  const env = { ...process.env };
  const envFile = path.join(REPO_ROOT, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const matched = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (matched) env[matched[1]] = matched[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

function argValue(name, fallback) {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function makeJwt(user, secret) {
  const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({ sub: user.id, openId: user.open_id, iat: now, exp: now + 3600 });
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function callApi(baseUrl, token, method, url, body) {
  const res = await fetch(`${baseUrl}/api${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (error) {
    json = null;
  }
  return { status: res.status, body: json };
}

const results = [];
function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? `  → ${detail}` : ''}`);
}

// ---------- 数据库 ----------

async function connect(env) {
  return mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USERNAME || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_DATABASE || 'baby_time',
    charset: 'utf8mb4',
  });
}

async function resolveOwner(db, forcedOwnerId) {
  if (forcedOwnerId) {
    const [rows] = await db.query(
      'SELECT id, open_id, nickname FROM users WHERE id = ?',
      [forcedOwnerId],
    );
    if (!rows.length) throw new Error(`--owner 指定的用户不存在：${forcedOwnerId}`);
    return rows[0];
  }
  const [rows] = await db.query(
    `SELECT u.id, u.open_id, u.nickname, MAX(b.created_at) AS last_baby_at
       FROM users u JOIN babies b ON b.user_id = u.id
      GROUP BY u.id, u.open_id, u.nickname
      ORDER BY last_baby_at DESC LIMIT 1`,
  );
  if (!rows.length) {
    throw new Error('本地库里没有「有宝宝的」用户，请先用小程序建一个宝宝档案');
  }
  return rows[0];
}

async function resolveBaby(db, ownerId, forcedBabyId) {
  if (forcedBabyId) return forcedBabyId;
  const [rows] = await db.query(
    'SELECT id, name FROM babies WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [ownerId],
  );
  if (!rows.length) throw new Error('该用户没有宝宝，请先用小程序建一个宝宝档案');
  return rows[0].id;
}

async function ensureSeedUser(db) {
  const [rows] = await db.query('SELECT id, open_id, nickname FROM users WHERE open_id = ?', [
    SEED_OPEN_ID,
  ]);
  if (rows.length) return { ...rows[0], created: false };

  const id = crypto.randomUUID();
  await db.query(
    'INSERT INTO users (id, open_id, union_id, nickname, avatar, role) VALUES (?, ?, ?, ?, NULL, NULL)',
    [id, SEED_OPEN_ID, `local_seed_union_${id.slice(0, 8)}`, SEED_USER_NAME],
  );
  return { id, open_id: SEED_OPEN_ID, nickname: SEED_USER_NAME, created: true };
}

async function seed(env, options) {
  const db = await connect(env);
  try {
    const owner = await resolveOwner(db, options.owner);
    const babyId = await resolveBaby(db, owner.id, options.baby);
    const member = await ensureSeedUser(db);

    await db.query(
      'DELETE FROM family_members WHERE user_id = ? AND inviter_id = ?',
      [member.id, owner.id],
    );
    await db.query(
      `INSERT INTO family_members (id, user_id, baby_id, inviter_id, role, status, invite_code)
       VALUES (?, ?, ?, ?, 'father', 'accepted', NULL)`,
      [crypto.randomUUID(), member.id, babyId, owner.id],
    );

    console.log(`\n已造好测试数据：`);
    console.log(`  家庭创建者：${owner.nickname}  (${owner.id})`);
    console.log(`  挂载的宝宝：${babyId}`);
    console.log(`  假家人：    ${member.nickname}  (${member.id})${member.created ? ' [本次新建]' : ' [复用已有]'}`);
    const [aliasExists] = await db.query("SHOW TABLES LIKE 'family_member_aliases'");
    if (!aliasExists.length) {
      console.log(
        '\n⚠️  没找到 family_member_aliases 表：请先重启服务端（npm run dev:server），' +
          '本地 synchronize 会自动建表。',
      );
    }
    return { owner, member, babyId };
  } finally {
    await db.end();
  }
}

async function clean(env) {
  const db = await connect(env);
  try {
    const [users] = await db.query('SELECT id FROM users WHERE open_id = ?', [SEED_OPEN_ID]);
    if (!users.length) {
      console.log('没有需要清理的测试数据。');
      return;
    }
    const seedUserId = users[0].id;
    const [removedMembers] = await db.query(
      'DELETE FROM family_members WHERE user_id = ? OR inviter_id = ?',
      [seedUserId, seedUserId],
    );
    const [removedAliases] = await db.query(
      'DELETE FROM family_member_aliases WHERE target_user_id = ? OR family_owner_id = ?',
      [seedUserId, seedUserId],
    );
    await db.query('DELETE FROM users WHERE id = ?', [seedUserId]);
    console.log(
      `已清理：成员关系 ${removedMembers.affectedRows} 条、备注 ${removedAliases.affectedRows} 条、测试用户 1 个。`,
    );
  } finally {
    await db.end();
  }
}

// ---------- 接口自检 ----------

async function check(env, options) {
  const baseUrl = (options.api || env.API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const secret = env.JWT_SECRET || 'baby-time-secret';

  const db = await connect(env);
  let owner;
  let member;
  let babyId;
  try {
    owner = await resolveOwner(db, options.owner);
    babyId = await resolveBaby(db, owner.id, options.baby);
    const [seedRows] = await db.query('SELECT id, open_id, nickname FROM users WHERE open_id = ?', [
      SEED_OPEN_ID,
    ]);
    if (!seedRows.length) {
      throw new Error('还没造测试数据，先跑：node apps/server/scripts/family-nickname-check.js seed');
    }
    member = seedRows[0];
  } finally {
    await db.end();
  }

  const ownerToken = makeJwt(owner, secret);
  const memberToken = makeJwt(member, secret);

  console.log(`\n接口自检 @ ${baseUrl}（创建者=${owner.nickname}，假家人=${member.nickname}）\n`);

  // 0. 服务可达
  const ping = await callApi(baseUrl, ownerToken, 'GET', '/family/members');
  if (ping.status !== 200) {
    record(false, '服务可达 + token 有效', `HTTP ${ping.status} ${JSON.stringify(ping.body)}`);
    console.log('\n服务没起来？先跑 `npm run dev:server`。');
    return;
  }
  record(true, '服务可达 + token 有效', `HTTP 200`);

  // 1. 成员列表应包含创建者自己和假家人
  let members = ping.body?.data || [];
  const ownerEntry = members.find(m => m.userId === owner.id);
  const memberEntry = members.find(m => m.userId === member.id);
  record(
    !!ownerEntry && !!memberEntry,
    '成员列表返回「创建者 + 假家人」',
    `共 ${members.length} 条：${members.map(m => m.user?.nickname || m.userId).join('、')}`,
  );
  if (!memberEntry) {
    console.log('\n假家人没有出现在列表里，后面的用例跳过。');
    return;
  }
  record(!!memberEntry.role === true, '每项带 role 字段（前端角色胶囊用）', `role=${memberEntry.role}`);

  // 1.5 先清掉历史备注，保证本脚本可以反复执行（幂等）
  await callApi(baseUrl, ownerToken, 'PATCH', '/family/member/nickname', {
    targetUserId: member.id,
    nickname: '',
  });
  const cleanFetch = await callApi(baseUrl, ownerToken, 'GET', '/family/members');
  const cleanEntry = (cleanFetch.body?.data || []).find(m => m.userId === member.id);
  record(
    cleanEntry?.nickname === null,
    '清空后该成员 nickname 为 null（未设备注）',
    `nickname=${JSON.stringify(cleanEntry?.nickname)}`,
  );

  // 2. 创建者给家人设备注
  const setRes = await callApi(baseUrl, ownerToken, 'PATCH', '/family/member/nickname', {
    targetUserId: member.id,
    nickname: SEED_REMARK,
  });
  record(
    setRes.status === 200 && setRes.body?.data?.nickname === SEED_REMARK,
    '创建者可以给家人设备注名',
    `HTTP ${setRes.status} nickname=${setRes.body?.data?.nickname}`,
  );

  const afterSet = await callApi(baseUrl, ownerToken, 'GET', '/family/members');
  const aliased = (afterSet.body?.data || []).find(m => m.userId === member.id);
  record(aliased?.nickname === SEED_REMARK, '列表再次拉取能拿到备注名', `nickname=${aliased?.nickname}`);

  // 3. 创建者改自己
  const selfRes = await callApi(baseUrl, ownerToken, 'PATCH', '/family/member/nickname', {
    targetUserId: owner.id,
    nickname: '我自己（备注测试）',
  });
  record(selfRes.status === 200, '创建者可以改自己的备注名', `HTTP ${selfRes.status}`);
  await callApi(baseUrl, ownerToken, 'PATCH', '/family/member/nickname', {
    targetUserId: owner.id,
    nickname: '',
  });

  // 4. 越权：改成非本家庭的用户
  const strangerRes = await callApi(baseUrl, ownerToken, 'PATCH', '/family/member/nickname', {
    targetUserId: crypto.randomUUID(),
    nickname: '局外人',
  });
  record(
    strangerRes.status === 400,
    '不能给「非本家庭成员」设备注（应 400）',
    `HTTP ${strangerRes.status} ${strangerRes.body?.message || ''}`,
  );

  // 5. 超长昵称
  const longRes = await callApi(baseUrl, ownerToken, 'PATCH', '/family/member/nickname', {
    targetUserId: member.id,
    nickname: '一'.repeat(21),
  });
  record(longRes.status === 400, '超过 20 字被拦截（应 400）', `HTTP ${longRes.status}`);

  // 6. 普通成员的权限边界
  const memberRenameOwner = await callApi(baseUrl, memberToken, 'PATCH', '/family/member/nickname', {
    targetUserId: owner.id,
    nickname: '成员越权改名',
  });
  record(
    memberRenameOwner.status === 400,
    '普通成员不能改别人的昵称（应 400）',
    `HTTP ${memberRenameOwner.status} ${memberRenameOwner.body?.message || ''}`,
  );

  const memberRenameSelf = await callApi(baseUrl, memberToken, 'PATCH', '/family/member/nickname', {
    targetUserId: member.id,
    nickname: '我自己起的名字',
  });
  record(memberRenameSelf.status === 200, '普通成员可以改自己的昵称', `HTTP ${memberRenameSelf.status}`);
  console.log(
    '   ℹ️  备注只有一条记录，创建者和成员改的是同一行，谁最后改以谁为准（上面这步已把创建者的备注覆盖掉）',
  );

  // 7. 恢复默认
  const restoreRes = await callApi(baseUrl, ownerToken, 'PATCH', '/family/member/nickname', {
    targetUserId: member.id,
    nickname: '',
  });
  record(
    restoreRes.status === 200 && restoreRes.body?.data?.nickname === null,
    '传空串可恢复默认（删除备注）',
    `nickname=${JSON.stringify(restoreRes.body?.data?.nickname)}`,
  );

  // 8. 收尾：重新写回一条备注，方便在小程序里直接看到效果
  await callApi(baseUrl, ownerToken, 'PATCH', '/family/member/nickname', {
    targetUserId: member.id,
    nickname: SEED_REMARK,
  });

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n结果：${results.length - failed}/${results.length} 通过`);
  if (failed === 0) {
    console.log(`
下一步（真机 / 开发者工具看效果）：
  1. 用创建者的账号打开「我的 → 家庭成员」，应能看到「${member.nickname}」显示为「${SEED_REMARK}」
  2. 点这张卡片 → 弹出操作层「修改昵称 / 移除成员」
  3. 点「修改昵称」改个名字保存，列表立刻更新；带「备注」小徽章
  4. 再点开可看到「恢复默认（使用微信昵称）」，点它 + 保存 即回到微信昵称
  5. 宝爸这个假账号的 token 没法在小程序里用，成员视角只由本脚本验证`);
  }
}

// ---------- 入口 ----------

(async () => {
  const env = loadEnv();
  const options = {
    owner: argValue('owner', ''),
    baby: argValue('baby', ''),
    api: argValue('api', ''),
  };
  const mode = process.argv[2] || 'all';

  try {
    if (mode === 'seed') {
      await seed(env, options);
    } else if (mode === 'clean') {
      await clean(env);
    } else if (mode === 'check') {
      await check(env, options);
    } else {
      await seed(env, options);
      await check(env, options);
    }
  } catch (error) {
    console.error(`\n执行失败：${error.message}`);
    process.exitCode = 1;
  }
})();
