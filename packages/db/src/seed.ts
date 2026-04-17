import { prisma } from "./index";

type SourceSeed = {
  slug: string;
  name: string;
  url: string;
  homepage?: string;
  type: "rss" | "scrape" | "api";
  lang: "en" | "zh";
  weight: number;
  category: "research" | "industry" | "opensource" | "media";
};

const sources: SourceSeed[] = [
  // ===== Research =====
  {
    slug: "arxiv-cs-ai",
    name: "arXiv cs.AI",
    url: "http://export.arxiv.org/rss/cs.AI",
    homepage: "https://arxiv.org/list/cs.AI/recent",
    type: "rss",
    lang: "en",
    weight: 1.2,
    category: "research",
  },
  {
    slug: "arxiv-cs-cl",
    name: "arXiv cs.CL",
    url: "http://export.arxiv.org/rss/cs.CL",
    homepage: "https://arxiv.org/list/cs.CL/recent",
    type: "rss",
    lang: "en",
    weight: 1.2,
    category: "research",
  },
  {
    slug: "arxiv-cs-lg",
    name: "arXiv cs.LG",
    url: "http://export.arxiv.org/rss/cs.LG",
    homepage: "https://arxiv.org/list/cs.LG/recent",
    type: "rss",
    lang: "en",
    weight: 1.1,
    category: "research",
  },

  // ===== Industry (labs & companies) =====
  {
    slug: "openai-blog",
    name: "OpenAI Blog",
    url: "https://openai.com/news/rss.xml",
    homepage: "https://openai.com/news/",
    type: "rss",
    lang: "en",
    weight: 2.0,
    category: "industry",
  },
  {
    slug: "anthropic-news",
    name: "Anthropic News",
    url: "https://www.anthropic.com/news/rss.xml",
    homepage: "https://www.anthropic.com/news",
    type: "rss",
    lang: "en",
    weight: 2.0,
    category: "industry",
  },
  {
    slug: "google-research",
    name: "Google Research Blog",
    url: "https://research.google/blog/rss/",
    homepage: "https://research.google/blog/",
    type: "rss",
    lang: "en",
    weight: 1.6,
    category: "industry",
  },
  {
    slug: "deepmind-blog",
    name: "Google DeepMind",
    url: "https://deepmind.google/blog/rss.xml",
    homepage: "https://deepmind.google/discover/blog/",
    type: "rss",
    lang: "en",
    weight: 1.8,
    category: "industry",
  },
  {
    slug: "meta-ai",
    name: "Meta AI",
    url: "https://ai.meta.com/blog/rss/",
    homepage: "https://ai.meta.com/blog/",
    type: "rss",
    lang: "en",
    weight: 1.5,
    category: "industry",
  },

  // ===== Community / Media (EN) =====
  {
    slug: "hn-frontpage",
    name: "Hacker News (AI filter)",
    url: "https://hnrss.org/frontpage?points=100",
    homepage: "https://news.ycombinator.com/",
    type: "rss",
    lang: "en",
    weight: 1.0,
    category: "media",
  },
  {
    slug: "reddit-ml",
    name: "r/MachineLearning",
    url: "https://www.reddit.com/r/MachineLearning/.rss",
    homepage: "https://www.reddit.com/r/MachineLearning/",
    type: "rss",
    lang: "en",
    weight: 0.9,
    category: "media",
  },
  {
    slug: "reddit-localllama",
    name: "r/LocalLLaMA",
    url: "https://www.reddit.com/r/LocalLLaMA/.rss",
    homepage: "https://www.reddit.com/r/LocalLLaMA/",
    type: "rss",
    lang: "en",
    weight: 0.9,
    category: "media",
  },
  {
    slug: "theverge-ai",
    name: "The Verge — AI",
    url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml",
    homepage: "https://www.theverge.com/ai-artificial-intelligence",
    type: "rss",
    lang: "en",
    weight: 1.2,
    category: "media",
  },
  {
    slug: "arstechnica-ai",
    name: "Ars Technica — AI",
    url: "https://feeds.arstechnica.com/arstechnica/ai",
    homepage: "https://arstechnica.com/ai/",
    type: "rss",
    lang: "en",
    weight: 1.1,
    category: "media",
  },

  // ===== Chinese media =====
  {
    slug: "jiqizhixin",
    name: "机器之心",
    url: "https://www.jiqizhixin.com/rss",
    homepage: "https://www.jiqizhixin.com/",
    type: "rss",
    lang: "zh",
    weight: 1.5,
    category: "media",
  },
  {
    slug: "qbitai",
    name: "量子位",
    url: "https://www.qbitai.com/feed",
    homepage: "https://www.qbitai.com/",
    type: "rss",
    lang: "zh",
    weight: 1.4,
    category: "media",
  },
  {
    slug: "36kr-ai",
    name: "36氪 AI",
    url: "https://36kr.com/information/AI",
    homepage: "https://36kr.com/information/AI",
    type: "scrape",
    lang: "zh",
    weight: 1.2,
    category: "media",
  },
  {
    slug: "infoq-cn-ai",
    name: "InfoQ 中国 · AI",
    url: "https://www.infoq.cn/topic/AI",
    homepage: "https://www.infoq.cn/topic/AI",
    type: "scrape",
    lang: "zh",
    weight: 1.1,
    category: "media",
  },

  // ===== Open source =====
  {
    slug: "github-trending",
    name: "GitHub Trending (AI)",
    url: "https://github.com/trending?since=daily",
    homepage: "https://github.com/trending",
    type: "scrape",
    lang: "en",
    weight: 1.3,
    category: "opensource",
  },
  {
    slug: "huggingface-trending",
    name: "HuggingFace Trending Models",
    url: "https://huggingface.co/api/models?sort=trending&limit=30",
    homepage: "https://huggingface.co/models?sort=trending",
    type: "api",
    lang: "en",
    weight: 1.3,
    category: "opensource",
  },
  {
    slug: "huggingface-papers",
    name: "HuggingFace Daily Papers",
    url: "https://huggingface.co/papers",
    homepage: "https://huggingface.co/papers",
    type: "scrape",
    lang: "en",
    weight: 1.4,
    category: "research",
  },
];

async function main() {
  console.log(`Seeding ${sources.length} sources...`);
  for (const s of sources) {
    await prisma.source.upsert({
      where: { slug: s.slug },
      create: s,
      update: {
        name: s.name,
        url: s.url,
        homepage: s.homepage,
        type: s.type,
        lang: s.lang,
        weight: s.weight,
        category: s.category,
      },
    });
    console.log(`  ✓ ${s.slug}`);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
