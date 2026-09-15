#!/usr/bin/env node
/**
 * 疫苗计划表一致性校验
 *
 * 背景：免疫程序表在前后端各存一份（无法直接共享代码，packages/shared 目前是空壳未接线）：
 *   - 客户端：apps/client/src/utils/vaccineSchedule.ts  → 展示「疫苗表 / 时间轴」
 *   - 服务端：apps/server/src/modules/notification/notification.service.ts 的 VACCINES → 提醒与计划接口
 * 两份表必须节点 ID、月龄、名称严格一致，否则会出现「时间轴显示了但提醒发不出」
 * 或「提醒发的节点客户端没有」这类难查的问题。
 *
 * 用法：npm run check:vaccine
 * 退出码非 0 表示存在漂移，可直接接进 CI。
 *
 * 规则：
 *  1. 客户端「时间轴节点」（非 referenceOnly）必须与服务端 VACCINES 一一对应（ID / 月龄 / 名称）
 *  2. referenceOnly 节点（如 13 周岁 HPV）不得出现在服务端，否则会被当成提醒节点
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CLIENT_FILE = path.join(REPO_ROOT, 'apps/client/src/utils/vaccineSchedule.ts');
const SERVER_FILE = path.join(REPO_ROOT, 'apps/server/src/modules/notification/notification.service.ts');

function readClientItems(source) {
  const items = [];
  const pattern =
    /\{ id: '([^']+)', ageMonths: (\d+), ageLabel: '([^']+)',[^\n]*?displayName: '([^']+)'([^\n]*)\}/g;
  let matched;
  while ((matched = pattern.exec(source))) {
    items.push({
      id: matched[1],
      months: Number(matched[2]),
      ageLabel: matched[3],
      name: matched[4],
      referenceOnly: /referenceOnly: true/.test(matched[5]),
    });
  }
  return items;
}

function readServerItems(source) {
  const start = source.indexOf('const VACCINES = [');
  const end = source.indexOf('] as const;', start);
  if (start < 0 || end < 0) {
    throw new Error('在 notification.service.ts 里找不到 VACCINES 数组');
  }
  const items = [];
  const pattern = /\['([^']+)', (\d+), '([^']+)'\]/g;
  let matched;
  while ((matched = pattern.exec(source.slice(start, end)))) {
    items.push({ id: matched[1], months: Number(matched[2]), name: matched[3] });
  }
  return items;
}

function main() {
  const clientItems = readClientItems(fs.readFileSync(CLIENT_FILE, 'utf8'));
  const serverItems = readServerItems(fs.readFileSync(SERVER_FILE, 'utf8'));
  const timelineItems = clientItems.filter(item => !item.referenceOnly);

  if (clientItems.length === 0 || serverItems.length === 0) {
    console.error('❌ 解析结果为空，可能是文件格式变了，请检查正则');
    process.exitCode = 1;
    return;
  }

  console.log(`客户端全部节点 ${clientItems.length}（仅参考展示 ${clientItems.length - timelineItems.length}）`);
  console.log(`客户端时间轴节点 ${timelineItems.length} / 服务端节点 ${serverItems.length}\n`);

  const problems = [];
  const serverById = new Map(serverItems.map(item => [item.id, item]));
  const timelineById = new Map(timelineItems.map(item => [item.id, item]));

  for (const client of timelineItems) {
    const server = serverById.get(client.id);
    if (!server) {
      problems.push(`服务端缺少节点 ${client.id}（${client.name}）→ 该节点不会有提醒`);
      continue;
    }
    if (server.months !== client.months) {
      problems.push(`${client.id} 月龄不一致：客户端 ${client.months} / 服务端 ${server.months}`);
    }
    if (server.name !== client.name) {
      problems.push(`${client.id} 名称不一致：客户端「${client.name}」/ 服务端「${server.name}」`);
    }
  }

  for (const server of serverItems) {
    if (!timelineById.has(server.id)) {
      problems.push(`客户端时间轴缺少节点 ${server.id}（${server.name}）→ 提醒会指向不存在的节点`);
    }
  }

  for (const item of clientItems.filter(entry => entry.referenceOnly)) {
    if (serverById.has(item.id)) {
      problems.push(`仅参考展示的 ${item.id} 不应出现在服务端，否则会被当成提醒节点`);
    }
  }

  timelineItems
    .slice()
    .sort((a, b) => a.months - b.months)
    .forEach(item => console.log(`  ${String(item.months).padStart(3)}月 ${item.ageLabel.padEnd(6)} ${item.name}`));

  console.log('');
  if (problems.length === 0) {
    console.log('✅ 前后端疫苗计划表完全一致');
    return;
  }
  console.log(`❌ 发现 ${problems.length} 处漂移：`);
  problems.forEach(problem => console.log(`   - ${problem}`));
  process.exitCode = 1;
}

main();
