import { CATALOG_BY_ID, type CatalogGroup } from "./catalog";

export type RankableNewsItem = {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  image: string | null;
  sourceId: string;
  sourceName: string;
};

type Candidate<T extends RankableNewsItem> = {
  item: T;
  tokens: Set<string>;
  normalizedTitle: string;
  publishedTs: number;
  baseScore: number;
  score: number;
  group: CatalogGroup;
  corroboratingSources: Set<string>;
};

type RankOptions = {
  now?: number;
  pageSize?: number;
};

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 24;
const FUTURE_TIMESTAMP_GRACE_HOURS = 6;
const STALE_DECAY_START_HOURS = 72;
export const EDITORIAL_ITEMS_PER_SOURCE = 4;

const SOURCE_WEIGHT: Readonly<Record<string, number>> = {
  "gnews-top": 1.55,
  "bbc-zh": 1.45,
  "dw-zh": 1.3,
  "rfi-zh": 1.2,
  guardian: 1.15,
  npr: 1.15,
  "gnews-world": 1.15,
  "gnews-biz": 1.05,
  "gnews-sci": 1.05,
  "bbc-biz": 1.05,
  "bbc-tech": 1,
  mittr: 1,
  quanta: 1,
  "gnews-tech": 0.9,
  arstechnica: 0.9,
  theverge: 0.85,
  techcrunch: 0.85,
  kr36: 0.8,
  hn: 0.8,
  jiqizhixin: 0.78,
  qbitai: 0.75,
  sspai: 0.72,
  solidot: 0.65,
  ifanr: 0.58,
  ithome: 0.42,
};

const IMPACT_SIGNALS: ReadonlyArray<{ pattern: RegExp; weight: number }> = [
  {
    pattern:
      /地震|洪灾|洪水|台风|飓风|海啸|山火|火灾|泥石流|坍塌|空难|遇难|死亡|伤亡|撤离|紧急状态|袭击|空袭|战争|冲突|停火|反恐|earthquake|flood|typhoon|hurricane|wildfire|disaster|killed|casualties|evacuat|attack|airstrike|war|ceasefire|terror/i,
    weight: 2.25,
  },
  {
    pattern:
      /国务院|中央|部委|监管|法院|法案|法律|禁令|制裁|关税|选举|总统|首相|政府|联合国|欧盟|北约|央行|美联储|政策|外交|国防|权利|版权|隐私|regulat|government|president|prime minister|election|congress|court|law|ban|sanction|tariff|united nations|federal reserve|policy|copyright|privacy/i,
    weight: 1.65,
  },
  {
    pattern:
      /非农|就业|失业|通胀|降息|加息|利率|国内生产总值|经济增长|衰退|金融危机|债务|汇率|股市|黄金|原油|jobs report|employment|unemployment|inflation|rate cut|rate hike|interest rate|\bgdp\b|recession|financial crisis|debt|currency|stocks?|gold|oil price/i,
    weight: 1.45,
  },
  {
    pattern:
      /收购|并购|破产|裁员|召回|财报|营收|利润|融资|上市申请|上市公司|首次公开募股|挂牌|辞职|下台|继任|首席执行官|数据泄露|安全漏洞|网络攻击|acqui|merger|bankrupt|layoff|recall|earnings|revenue|profit|funding|ipo|resign|steps down|chief executive|data breach|security flaw|cyberattack/i,
    weight: 1.05,
  },
  {
    pattern:
      /突破|首次|开源|发布.{0,12}(模型|芯片|系统|标准|报告)|推出.{0,12}(模型|芯片|系统)|研究发现|临床试验|批准|芯片|人工智能|大模型|量子|航天|卫星|breakthrough|first-ever|open source|launch.{0,16}(model|chip|system|mission)|release.{0,16}(model|software|report)|study finds|clinical trial|approved|chip|artificial intelligence|\bai\b|model|quantum|space|satellite/i,
    weight: 0.65,
  },
];

const LOW_VALUE_SIGNALS: ReadonlyArray<{ pattern: RegExp; penalty: number }> = [
  {
    pattern:
      /优惠|折扣|降价|促销|好价|秒杀|领券|值得买|返现|deal|discount|coupon|cashback|\bsale\b|almost \$?\d+ off/i,
    penalty: 3,
  },
  {
    pattern:
      /评测|测评|上手|开箱|图赏|选购|购买指南|盘点|榜单|最佳.{0,12}(产品|设备|手机|电脑)|review|hands-on|unboxing|buying guide|best .{0,24}(gadgets?|devices?|laptops?|phones?)/i,
    penalty: 1.65,
  },
  {
    pattern:
      /爆料|曝.{0,8}(将|计划|有望)|传闻|据称|或将|可能.{0,8}(发布|推出|上市)|有望|rumou?r|reportedly|may .{0,16}(launch|release)|could .{0,16}(launch|release)/i,
    penalty: 0.95,
  },
  {
    pattern:
      /教程|攻略|技巧|怎么玩|如何.{0,12}(设置|安装|购买|使用)|早报|晚报|日报|一周回顾|how to|tips and tricks|daily roundup|weekly roundup/i,
    penalty: 1.25,
  },
  {
    pattern:
      /官图|新车|车型|suv|轿车|纯电版|插混|前备箱|续航.{0,8}(公里|km)|排位赛|锦标赛|联赛|比分|直面会|游戏资讯|发布会预告|motorsport|qualifying|championship|tournament|game direct|what to expect at .{0,24}(event|launch)/i,
    penalty: 1.35,
  },
  {
    pattern: /签署.{0,12}合作协议|战略合作|现身.{0,12}名单|routine partnership/i,
    penalty: 0.4,
  },
  {
    pattern:
      /专题网站|座谈会|研讨会|签约仪式|启动仪式|主题活动|共襄|震撼|炸裂|刷屏|杀疯|人类进入|年度大考|一文看懂|刚刚.{0,4}(发布|推出)|史上最大|暴涨\d|那些.{0,12}(公司|人).{0,8}终于|finally .{0,12}(lets|allows)/i,
    penalty: 0.9,
  },
];

const ASCII_STOP_WORDS = new Set([
  "about",
  "after",
  "against",
  "also",
  "and",
  "are",
  "been",
  "before",
  "being",
  "from",
  "have",
  "into",
  "more",
  "new",
  "says",
  "than",
  "that",
  "the",
  "their",
  "this",
  "through",
  "will",
  "with",
]);

const CJK_STOP_BIGRAMS = new Set([
  "今日",
  "消息",
  "宣布",
  "表示",
  "报道",
  "指出",
  "最新",
  "正式",
  "目前",
  "已经",
  "进行",
  "举行",
  "有关",
  "公司",
]);

function finitePublishedTs(iso: string | null): number {
  if (!iso) return 0;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
}

function decodeHeadlineEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (entity: string, raw: string) => decodeCodePoint(entity, raw, 10))
    .replace(/&#x([\da-f]+);/gi, (entity: string, raw: string) => decodeCodePoint(entity, raw, 16))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function decodeCodePoint(entity: string, raw: string, radix: number): string {
  const value = Number.parseInt(raw, radix);
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : entity;
}

function normalizeHeadline(title: string): string {
  return decodeHeadlineEntities(title)
    .normalize("NFKC")
    .replace(/\s+[-–—|]\s+[^-–—|]{1,40}$/u, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleTokens(normalized: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of normalized.match(/[a-z][a-z\d]{1,}|\d{2,}/g) ?? []) {
    if (!ASCII_STOP_WORDS.has(word)) tokens.add(word);
  }
  for (const run of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (let index = 0; index < run.length - 1; index++) {
      const bigram = run.slice(index, index + 2);
      if (!CJK_STOP_BIGRAMS.has(bigram)) tokens.add(bigram);
    }
  }
  return tokens;
}

function headlineSimilarity(a: Candidate<RankableNewsItem>, b: Candidate<RankableNewsItem>): number {
  if (a.normalizedTitle === b.normalizedTitle) return 1;
  const shorter = a.normalizedTitle.length <= b.normalizedTitle.length ? a : b;
  const longer = shorter === a ? b : a;
  if (
    shorter.normalizedTitle.length >= 12 &&
    longer.normalizedTitle.includes(shorter.normalizedTitle) &&
    shorter.normalizedTitle.length / longer.normalizedTitle.length >= 0.62
  ) {
    return 0.92;
  }

  const minSize = Math.min(a.tokens.size, b.tokens.size);
  if (minSize < 3) return 0;
  let shared = 0;
  for (const token of a.tokens) {
    if (b.tokens.has(token)) shared++;
  }
  if (shared < 3) return 0;
  const overlap = shared / minSize;
  const jaccard = shared / (a.tokens.size + b.tokens.size - shared);
  if (overlap >= 0.62 && jaccard >= 0.34) return (overlap + jaccard) / 2;
  if (shared >= 7 && overlap >= 0.35 && jaccard >= 0.15) return 0.5;
  return 0;
}

function freshnessScore(publishedTs: number, now: number): number {
  if (!publishedTs) return -2.25;
  const ageHours = (now - publishedTs) / HOUR_MS;
  if (ageHours < -FUTURE_TIMESTAMP_GRACE_HOURS) {
    const futureHours = Math.abs(ageHours) - FUTURE_TIMESTAMP_GRACE_HOURS;
    return Math.max(-5, -2.25 - Math.log2(1 + futureHours / 24));
  }

  const effectiveAgeHours = Math.max(0, ageHours);
  const recentScore = 1.25 - Math.log2(1 + effectiveAgeHours / 2) * 0.38;
  if (effectiveAgeHours <= STALE_DECAY_START_HOURS) return recentScore;

  // Major-event keywords remain useful, but should not keep months-old stories
  // on today's front page after their normal freshness score has bottomed out.
  const stalePenalty = Math.min(
    5,
    Math.log2(effectiveAgeHours / STALE_DECAY_START_HOURS) * 1.15,
  );
  return recentScore - stalePenalty;
}

function signalScore(title: string): number {
  let impact = 0;
  for (const signal of IMPACT_SIGNALS) {
    if (signal.pattern.test(title)) impact += signal.weight;
  }
  let penalty = 0;
  for (const signal of LOW_VALUE_SIGNALS) {
    if (signal.pattern.test(title)) penalty += signal.penalty;
  }
  if (/[?!？！]{2,}/u.test(title)) penalty += 0.3;
  else if (/[?？]$/u.test(title)) penalty += 0.2;
  return Math.min(3.6, impact) - Math.min(4, penalty);
}

function completenessScore(item: RankableNewsItem): number {
  let score = 0;
  const titleLength = Array.from(item.title).length;
  if (titleLength >= 12 && titleLength <= 120) score += 0.18;
  if (item.summary.trim().length >= 80) score += 0.18;
  if (item.image) score += 0.08;
  return score;
}

function compareCandidates<T extends RankableNewsItem>(a: Candidate<T>, b: Candidate<T>): number {
  return (
    b.score - a.score ||
    b.publishedTs - a.publishedTs ||
    a.item.sourceId.localeCompare(b.item.sourceId) ||
    a.item.title.localeCompare(b.item.title)
  );
}

function asCandidate<T extends RankableNewsItem>(item: T, now: number): Candidate<T> {
  const normalizedTitle = normalizeHeadline(item.title);
  const publishedTs = finitePublishedTs(item.publishedAt);
  const source = CATALOG_BY_ID.get(item.sourceId);
  const baseScore =
    (SOURCE_WEIGHT[item.sourceId] ?? 0.62) +
    freshnessScore(publishedTs, now) +
    signalScore(normalizedTitle) +
    completenessScore(item);
  return {
    item,
    normalizedTitle,
    tokens: titleTokens(normalizedTitle),
    publishedTs,
    baseScore,
    score: baseScore,
    group: source?.group ?? "cn",
    corroboratingSources: new Set([item.sourceId]),
  };
}

function clusterEvents<T extends RankableNewsItem>(candidates: Candidate<T>[]): Candidate<T>[] {
  const clusters: Candidate<T>[][] = [];
  for (const candidate of candidates) {
    let cluster: Candidate<T>[] | undefined;
    for (const current of clusters) {
      const representative = current[0]!;
      const timeGap = Math.abs(candidate.publishedTs - representative.publishedTs);
      if (candidate.publishedTs && representative.publishedTs && timeGap > 72 * HOUR_MS) continue;
      if (
        headlineSimilarity(
          candidate as Candidate<RankableNewsItem>,
          representative as Candidate<RankableNewsItem>,
        ) >= 0.48
      ) {
        cluster = current;
        break;
      }
    }
    if (cluster) cluster.push(candidate);
    else clusters.push([candidate]);
  }

  return clusters.map((cluster) => {
    cluster.sort((a, b) => b.baseScore - a.baseScore || b.publishedTs - a.publishedTs);
    const representative = cluster[0]!;
    const sources = new Set(cluster.map((candidate) => candidate.item.sourceId));
    const corroborationBoost = Math.min(2.5, Math.log2(Math.max(1, sources.size)) * 1.35);
    return {
      ...representative,
      score: representative.baseScore + corroborationBoost,
      corroboratingSources: sources,
    };
  });
}

function diversifyFirstPage<T extends RankableNewsItem>(
  candidates: Candidate<T>[],
  pageSize: number,
): Candidate<T>[] {
  if (candidates.length <= 1 || pageSize <= 0) return [...candidates];
  const sources = new Set(candidates.map((candidate) => candidate.item.sourceId));
  const groups = new Set(candidates.map((candidate) => candidate.group));
  const sourceCap = Math.max(
    EDITORIAL_ITEMS_PER_SOURCE,
    Math.ceil(pageSize / Math.max(1, sources.size)),
  );
  const groupCap = groups.size <= 1 ? pageSize : Math.max(10, Math.ceil(pageSize / groups.size) + 4);
  const selected: Candidate<T>[] = [];
  const remaining = new Set(candidates);
  const sourceCounts = new Map<string, number>();
  const groupCounts = new Map<CatalogGroup, number>();

  while (selected.length < Math.min(pageSize, candidates.length)) {
    let best: Candidate<T> | null = null;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;
    for (const candidate of remaining) {
      const sourceCount = sourceCounts.get(candidate.item.sourceId) ?? 0;
      const groupCount = groupCounts.get(candidate.group) ?? 0;
      if (sourceCount >= sourceCap || groupCount >= groupCap) continue;
      const adjustedScore = candidate.score - sourceCount * 0.78 - groupCount * 0.16;
      if (
        adjustedScore > bestAdjustedScore ||
        (adjustedScore === bestAdjustedScore && best && compareCandidates(candidate, best) < 0)
      ) {
        best = candidate;
        bestAdjustedScore = adjustedScore;
      }
    }
    if (!best) break;
    selected.push(best);
    remaining.delete(best);
    sourceCounts.set(best.item.sourceId, (sourceCounts.get(best.item.sourceId) ?? 0) + 1);
    groupCounts.set(best.group, (groupCounts.get(best.group) ?? 0) + 1);
  }

  if (selected.length < Math.min(pageSize, candidates.length)) {
    const backfill = [...remaining].sort(compareCandidates);
    for (const candidate of backfill) {
      selected.push(candidate);
      remaining.delete(candidate);
      if (selected.length >= Math.min(pageSize, candidates.length)) break;
    }
  }

  return [...selected, ...[...remaining].sort(compareCandidates)];
}

/**
 * Rank the homepage as an editorial front page: one representative per event,
 * corroborated stories first, then a source- and topic-diverse first page.
 */
export function rankHomepageItems<T extends RankableNewsItem>(
  items: readonly T[],
  options: RankOptions = {},
): T[] {
  const now = Number.isFinite(options.now) ? options.now! : Date.now();
  const pageSize = Math.max(1, Math.trunc(options.pageSize ?? DEFAULT_PAGE_SIZE));
  const candidates = items.map((item) => asCandidate(item, now));
  const clustered = clusterEvents(candidates).sort(compareCandidates);
  return diversifyFirstPage(clustered, pageSize).map((candidate) => candidate.item);
}

/**
 * Keep the first streamed source from filling the whole front page. Six healthy
 * sources build the initial 24-card edition; later sources extend the tail.
 */
export function editorialProgressiveLimit(
  healthySourceCount: number,
  pageSize = DEFAULT_PAGE_SIZE,
  itemsPerSource = DEFAULT_PAGE_SIZE,
): number {
  const count = Math.max(0, Math.trunc(healthySourceCount));
  const initialSources = Math.ceil(pageSize / EDITORIAL_ITEMS_PER_SOURCE);
  if (count <= initialSources) return count * EDITORIAL_ITEMS_PER_SOURCE;
  return pageSize + (count - initialSources) * Math.max(1, Math.trunc(itemsPerSource));
}
