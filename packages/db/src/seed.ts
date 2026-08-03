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
    // JSON API — includes the abstract, unlike the HTML list page.
    url: "https://huggingface.co/api/daily_papers?limit=50",
    homepage: "https://huggingface.co/papers",
    type: "api",
    lang: "en",
    weight: 1.4,
    category: "research",
  },
];

type BlogSeed = {
  slug: string;
  name: string;
  author: string;
  url: string;
  feedUrl?: string;
  affiliation?: string;
  bioEn: string;
  bioZh: string;
  tags: string[];
  lang: "en" | "zh";
  featured?: boolean;
  sortOrder?: number;
};

/**
 * Editorial shortlist of high-signal AI researcher / practitioner blogs.
 * Permanent curated directory — not news sources, not subject to 14-day purge.
 * Keep this list intentional and short; quality over coverage.
 */
const blogs: BlogSeed[] = [
  {
    slug: "lils-log",
    name: "Lil's Log",
    author: "Lilian Weng",
    url: "https://lilianweng.github.io/",
    feedUrl: "https://lilianweng.github.io/index.xml",
    affiliation: "OpenAI",
    bioEn:
      "Deep, textbook-quality surveys of modern ML — agents, prompt engineering, RLHF, diffusion. The default first stop when a topic is new to you.",
    bioZh:
      "现代机器学习的教科书级长文综述：Agent、Prompt、RLHF、Diffusion 等。遇到新主题时的默认第一站。",
    tags: ["llm", "agents", "research", "survey"],
    lang: "en",
    featured: true,
    sortOrder: 10,
  },
  {
    slug: "colahs-blog",
    name: "colah's blog",
    author: "Chris Olah",
    url: "https://colah.github.io/",
    affiliation: "Anthropic",
    bioEn:
      "Visual, patient explanations of neural nets and interpretability. LSTM, attention, and circuits — still unmatched for building intuition.",
    bioZh:
      "神经网络与可解释性的视觉化慢读。LSTM、Attention、Circuits —— 建立直觉的不二之选。",
    tags: ["interpretability", "research", "tutorial"],
    lang: "en",
    featured: true,
    sortOrder: 20,
  },
  {
    slug: "distill",
    name: "Distill",
    author: "Distill contributors",
    url: "https://distill.pub/",
    feedUrl: "https://distill.pub/rss.xml",
    affiliation: "Independent",
    bioEn:
      "Interactive, visual essays on machine learning. Many pieces are still the clearest public explanations of core ideas.",
    bioZh:
      "可交互的机器学习可视化长文。许多文章至今仍是核心概念最清晰的公开讲解。",
    tags: ["interpretability", "research", "tutorial"],
    lang: "en",
    featured: true,
    sortOrder: 30,
  },
  {
    slug: "karpathy",
    name: "Andrej Karpathy",
    author: "Andrej Karpathy",
    url: "https://karpathy.github.io/",
    feedUrl: "https://karpathy.github.io/feed.xml",
    affiliation: "Independent",
    bioEn:
      "From software 2.0 to nanoGPT — practical research taste from someone who has shipped at the frontier.",
    bioZh:
      "从 Software 2.0 到 nanoGPT —— 站在前沿真正落地过的人，带来的研究品味与工程直觉。",
    tags: ["llm", "engineering", "research"],
    lang: "en",
    featured: true,
    sortOrder: 40,
  },
  {
    slug: "sebastian-raschka",
    name: "Ahead of AI",
    author: "Sebastian Raschka",
    url: "https://sebastianraschka.com/blog/",
    feedUrl: "https://magazine.sebastianraschka.com/feed",
    affiliation: "Independent",
    bioEn:
      "Clear explainers on LLMs, finetuning, and research papers. Excellent bridge between academic papers and practitioners.",
    bioZh:
      "LLM、微调与论文的清晰解读。学术论文与从业者之间最好的桥梁之一。",
    tags: ["llm", "research", "tutorial"],
    lang: "en",
    featured: true,
    sortOrder: 50,
  },
  {
    slug: "jay-alammar",
    name: "Jay Alammar",
    author: "Jay Alammar",
    url: "https://jalammar.github.io/",
    feedUrl: "https://jalammar.github.io/feed.xml",
    affiliation: "Cohere",
    bioEn:
      "The Illustrated Transformer and friends — the most widely shared visual intros to modern NLP architectures.",
    bioZh:
      "《图解 Transformer》系列 —— 现代 NLP 架构被传播最广的可视化入门。",
    tags: ["llm", "tutorial", "research"],
    lang: "en",
    featured: false,
    sortOrder: 60,
  },
  {
    slug: "chip-huyen",
    name: "Chip Huyen",
    author: "Chip Huyen",
    url: "https://huyenchip.com/",
    feedUrl: "https://huyenchip.com/feed.xml",
    affiliation: "Independent",
    bioEn:
      "ML systems, LLMOps, and building products with models. Grounded writing from the author of Designing Machine Learning Systems.",
    bioZh:
      "ML 系统、LLMOps 与模型产品化。《Designing Machine Learning Systems》作者的务实写作。",
    tags: ["systems", "engineering", "llm"],
    lang: "en",
    featured: true,
    sortOrder: 70,
  },
  {
    slug: "eugene-yan",
    name: "Eugene Yan",
    author: "Eugene Yan",
    url: "https://eugeneyan.com/",
    feedUrl: "https://eugeneyan.com/rss/",
    affiliation: "Amazon",
    bioEn:
      "Applied ML, recsys, and LLM application patterns. Strong on what actually works in production.",
    bioZh:
      "应用 ML、推荐系统与 LLM 落地模式。关注生产环境里真正有效的做法。",
    tags: ["engineering", "llm", "systems"],
    lang: "en",
    featured: false,
    sortOrder: 80,
  },
  {
    slug: "simon-willison",
    name: "Simon Willison",
    author: "Simon Willison",
    url: "https://simonwillison.net/",
    feedUrl: "https://simonwillison.net/atom/everything/",
    affiliation: "Independent",
    bioEn:
      "Daily notes on LLMs, tooling, and datasette. Extremely high signal-to-noise for people who build with models.",
    bioZh:
      "LLM、工具链与 Datasette 的每日笔记。给「用模型做事」的人极高信噪比。",
    tags: ["engineering", "llm", "tools"],
    lang: "en",
    featured: true,
    sortOrder: 90,
  },
  {
    slug: "interconnects",
    name: "Interconnects",
    author: "Nathan Lambert",
    url: "https://www.interconnects.ai/",
    feedUrl: "https://www.interconnects.ai/feed",
    affiliation: "Ai2",
    bioEn:
      "Post-training, RLHF, open models, and the research politics of modern LLMs. Written from inside the lab.",
    bioZh:
      "Post-training、RLHF、开源模型与现代 LLM 的研究政治。实验室内部视角。",
    tags: ["llm", "alignment", "research", "open-source"],
    lang: "en",
    featured: true,
    sortOrder: 100,
  },
  {
    slug: "latent-space",
    name: "Latent Space",
    author: "swyx & Alessio",
    url: "https://www.latent.space/",
    feedUrl: "https://www.latent.space/feed",
    affiliation: "Independent",
    bioEn:
      "The AI engineer stack — interviews, essays, and industry maps for people shipping LLM products.",
    bioZh:
      "AI Engineer 技术栈 —— 访谈、长文与产业地图，面向真正在交付 LLM 产品的人。",
    tags: ["engineering", "llm", "industry"],
    lang: "en",
    featured: false,
    sortOrder: 110,
  },
  {
    slug: "hamel-husain",
    name: "Hamel's Blog",
    author: "Hamel Husain",
    url: "https://hamel.dev/",
    feedUrl: "https://hamel.dev/feed.xml",
    affiliation: "Independent",
    bioEn:
      "LLM evaluation, tooling, and hard-won lessons from consulting on real AI products.",
    bioZh:
      "LLM 评测、工具链，以及在真实 AI 产品咨询里踩过的坑。",
    tags: ["engineering", "llm", "evaluation"],
    lang: "en",
    featured: false,
    sortOrder: 120,
  },
  {
    slug: "bounded-regret",
    name: "Bounded Regret",
    author: "Jacob Steinhardt",
    url: "https://bounded-regret.ghost.io/",
    feedUrl: "https://bounded-regret.ghost.io/rss/",
    affiliation: "UC Berkeley",
    bioEn:
      "Research taste, forecasting, and AI risk from a Berkeley professor who co-runs a major lab.",
    bioZh:
      "研究品味、预测与 AI 风险 —— 来自联合主持重要实验室的伯克利教授。",
    tags: ["research", "alignment"],
    lang: "en",
    featured: false,
    sortOrder: 130,
  },
  {
    slug: "argmin",
    name: "argmin",
    author: "Ben Recht",
    url: "https://www.argmin.net/",
    feedUrl: "https://www.argmin.net/feed",
    affiliation: "UC Berkeley",
    bioEn:
      "Contrarian, rigorous takes on ML research culture, optimization, and what the field actually measures.",
    bioZh:
      "对 ML 研究文化、优化与领域度量方式的犀利、严谨评论。",
    tags: ["research", "opinion"],
    lang: "en",
    featured: false,
    sortOrder: 140,
  },
  {
    slug: "the-gradient",
    name: "The Gradient",
    author: "The Gradient",
    url: "https://thegradient.pub/",
    feedUrl: "https://thegradient.pub/rss/",
    affiliation: "Independent",
    bioEn:
      "Long-form AI essays from researchers and practitioners — interviews, critiques, and field overviews.",
    bioZh:
      "研究者与从业者的 AI 长文 —— 访谈、批评与领域综述。",
    tags: ["research", "opinion", "industry"],
    lang: "en",
    featured: false,
    sortOrder: 150,
  },
  {
    slug: "bair-blog",
    name: "BAIR Blog",
    author: "Berkeley AI Research",
    url: "https://bair.berkeley.edu/blog/",
    feedUrl: "https://bair.berkeley.edu/blog/feed.xml",
    affiliation: "UC Berkeley",
    bioEn:
      "Official research blog of Berkeley AI Research — paper explainers straight from the authors.",
    bioZh:
      "伯克利 AI 研究院官方博客 —— 论文作者亲自撰写的解读。",
    tags: ["research", "llm", "robotics"],
    lang: "en",
    featured: false,
    sortOrder: 160,
  },
  {
    slug: "jason-wei",
    name: "Jason Wei",
    author: "Jason Wei",
    url: "https://www.jasonwei.net/blog",
    affiliation: "OpenAI",
    bioEn:
      "Chain-of-thought, emergent abilities, and scaling — short, sharp posts from a core LLM researcher.",
    bioZh:
      "思维链、涌现能力与 Scaling —— 核心 LLM 研究者的短而锋利的文章。",
    tags: ["llm", "research"],
    lang: "en",
    featured: false,
    sortOrder: 170,
  },
  {
    slug: "fast-ai",
    name: "fast.ai",
    author: "Jeremy Howard & team",
    url: "https://www.fast.ai/",
    feedUrl: "https://www.fast.ai/posts/index.xml",
    affiliation: "fast.ai",
    bioEn:
      "Practical deep learning for coders — opinionated, accessible, and still one of the best on-ramps.",
    bioZh:
      "面向程序员的实用深度学习 —— 观点鲜明、好上手，至今仍是最好的入门路径之一。",
    tags: ["tutorial", "engineering", "research"],
    lang: "en",
    featured: false,
    sortOrder: 180,
  },
  {
    slug: "kexue-fm",
    name: "科学空间",
    author: "苏剑林",
    url: "https://kexue.fm/",
    feedUrl: "https://kexue.fm/feed",
    affiliation: "Independent",
    bioEn:
      "One of the highest-signal Chinese technical blogs on NLP, math for ML, and model internals.",
    bioZh:
      "中文区信噪比最高的技术博客之一：NLP、机器学习数学、模型机理。",
    tags: ["research", "llm", "chinese", "tutorial"],
    lang: "zh",
    featured: true,
    sortOrder: 55,
  },
  {
    slug: "gwern",
    name: "Gwern.net",
    author: "Gwern Branwen",
    url: "https://gwern.net/",
    feedUrl: "https://gwern.net/atom.xml",
    affiliation: "Independent",
    bioEn:
      "Encyclopedic essays on AI, scaling, and culture. Dense, cited, and often years ahead of the discourse.",
    bioZh:
      "关于 AI、Scaling 与文化的百科式长文。密集、有引用，常常领先舆论数年。",
    tags: ["research", "alignment", "opinion"],
    lang: "en",
    featured: false,
    sortOrder: 190,
  },
  {
    slug: "huggingface-blog",
    name: "Hugging Face Blog",
    author: "Hugging Face",
    url: "https://huggingface.co/blog",
    feedUrl: "https://huggingface.co/blog/feed.xml",
    affiliation: "Hugging Face",
    bioEn:
      "Open-source model releases, tutorials, and ecosystem notes from the hub that hosts most of them.",
    bioZh:
      "开源模型发布、教程与生态笔记 —— 来自托管其中大多数模型的平台。",
    tags: ["open-source", "engineering", "llm", "tutorial"],
    lang: "en",
    featured: false,
    sortOrder: 200,
  },
  {
    slug: "eleutherai",
    name: "EleutherAI Blog",
    author: "EleutherAI",
    url: "https://blog.eleuther.ai/",
    feedUrl: "https://blog.eleuther.ai/index.xml",
    affiliation: "EleutherAI",
    bioEn:
      "Open-source LLM research — GPT-Neo lineage, interpretability, and evaluation from the independent lab.",
    bioZh:
      "开源 LLM 研究 —— GPT-Neo 一脉、可解释性与评测，来自独立实验室。",
    tags: ["open-source", "research", "llm"],
    lang: "en",
    featured: false,
    sortOrder: 210,
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

  console.log(`Seeding ${blogs.length} curated blogs...`);
  for (const b of blogs) {
    const data = {
      name: b.name,
      author: b.author,
      url: b.url,
      feedUrl: b.feedUrl ?? null,
      affiliation: b.affiliation ?? null,
      bioEn: b.bioEn,
      bioZh: b.bioZh,
      tags: b.tags,
      lang: b.lang,
      featured: b.featured ?? false,
      sortOrder: b.sortOrder ?? 100,
      enabled: true,
    };
    await prisma.curatedBlog.upsert({
      where: { slug: b.slug },
      create: { slug: b.slug, ...data },
      update: data,
    });
    console.log(`  ✓ blog:${b.slug}`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
