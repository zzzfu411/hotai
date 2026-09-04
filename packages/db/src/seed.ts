import { BRIEFING_SOURCE_SLUG_SET, prisma } from "./index.js";

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

// Seed is the allowlist writer. Rows stay in the table so a source can be
// added later, but re-enablement means adding the slug to BRIEFING_SOURCE_SLUGS
// — a routine seed always rewrites Source.enabled from that set.
const DEFAULT_ENABLED_SOURCE_SLUGS = BRIEFING_SOURCE_SLUG_SET;

const sources: SourceSeed[] = [
  // ===== Research =====
  {
    slug: "arxiv-cs-ai",
    name: "arXiv cs.AI",
    url: "http://export.arxiv.org/rss/cs.AI",
    homepage: "https://arxiv.org/list/cs.AI/recent",
    type: "rss",
    lang: "en",
    weight: 1.5,
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
    weight: 1.5,
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
    weight: 2.4,
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
    weight: 1.8,
    category: "research",
  },
  {
    slug: "huggingface-blog",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    homepage: "https://huggingface.co/blog",
    type: "rss",
    lang: "en",
    weight: 2.4,
    category: "industry",
  },
  {
    slug: "juya-daily",
    name: "橘鸦早报",
    url: "https://daily.juya.uk/rss.xml",
    homepage: "https://daily.juya.uk/",
    type: "rss",
    lang: "zh",
    weight: 2.2,
    category: "research",
  },
];

type GuideStartHere = {
  title: string;
  url?: string;
  noteEn?: string;
  noteZh?: string;
};

type BlogGuide = {
  cadenceEn: string;
  cadenceZh: string;
  howEn: string;
  howZh: string;
  timelineEn: string;
  timelineZh: string;
  startHere: GuideStartHere[];
};

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
  guide: BlogGuide;
};

/**
 * Editorial shortlist of high-signal AI researcher / practitioner blogs.
 * Permanent curated directory — not news sources, not subject to 14-day purge.
 * Each entry carries a bilingual「食用指南」: cadence, how-to-read, timeline, start-here.
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
    guide: {
      cadenceEn: "A few long surveys per year — rare, dense, keep forever.",
      cadenceZh: "一年几篇长文综述，更新慢但篇篇可收藏多年。",
      howEn:
        "Do not binge. Subscribe to RSS, and when a new post lands, block 1–2 hours. Read once for the map, then keep it as a reference when you hit the same topic at work. Skim the ToC first; jump to the section you need.",
      howZh:
        "不要连刷。订 RSS，新文落地时专门留 1–2 小时。先通读建地图，之后当字典查。先扫目录，再跳到你当下需要的章节。",
      timelineEn:
        "2017–19: classic DL notes (attention, GAN, meta-learning). 2020–22: self-supervised / contrastive / diffusion era. 2023+: LLM stack — prompting, agents, RLHF, long-context. Treat older posts as durable foundations, not outdated news.",
      timelineZh:
        "2017–19：经典 DL 笔记（Attention、GAN、元学习）。2020–22：自监督 / 对比学习 / Diffusion。2023+：LLM 栈 —— Prompt、Agent、RLHF、长上下文。旧文是地基，不是过期新闻。",
      startHere: [
        {
          title: "LLM Powered Autonomous Agents",
          url: "https://lilianweng.github.io/posts/2023-06-23-agent/",
          noteEn: "The agent survey everyone still links.",
          noteZh: "Agent 综述，至今仍是默认引用。",
        },
        {
          title: "Prompt Engineering",
          url: "https://lilianweng.github.io/posts/2023-03-15-prompt-engineering/",
          noteEn: "Best single overview of prompting techniques.",
          noteZh: "Prompt 技巧最好的单篇总览。",
        },
        {
          title: "RLHF",
          url: "https://lilianweng.github.io/posts/2023-01-02-rlhf/",
          noteEn: "How post-training actually works, end to end.",
          noteZh: "Post-training 端到端是怎么做的。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Sparse historical posts; later work moved to Distill / Anthropic.",
      cadenceZh: "历史文章稀疏；后期工作多在 Distill / Anthropic。",
      howEn:
        "Read on a large screen. These are visual essays — follow the diagrams, not just the prose. Great as a weekend deep-dive, not a commute skim. After the classics, jump to Anthropic interpretability for current circuits work.",
      howZh:
        "用大屏看。这是视觉长文 —— 跟图走，别只扫字。适合周末深读，不适合通勤速刷。经典读完后，可转 Anthropic 可解释性系列看当代 circuits。",
      timelineEn:
        "2014–16: LSTM / neural net fundamentals. 2015–17: attention & embeddings visualised. Later: Distill era + Anthropic circuits/mech-interp. The personal blog is mostly the foundation layer.",
      timelineZh:
        "2014–16：LSTM / 神经网络基础。2015–17：Attention 与嵌入可视化。之后：Distill 时代 + Anthropic circuits。个人博客主要是地基层。",
      startHere: [
        {
          title: "Understanding LSTM Networks",
          url: "https://colah.github.io/posts/2015-08-Understanding-LSTMs/",
          noteEn: "Still the best LSTM intuition piece ever written.",
          noteZh: "至今最好的 LSTM 直觉文。",
        },
        {
          title: "Neural Networks, Manifolds, and Topology",
          url: "https://colah.github.io/posts/2014-03-NN-Manifolds-Topology/",
          noteEn: "Geometry of what nets actually learn.",
          noteZh: "网络到底在学什么几何。",
        },
        {
          title: "Visualizing Attention",
          url: "https://colah.github.io/posts/2016-01-Visualizing-Representations/",
          noteEn: "Bridge into modern transformer thinking.",
          noteZh: "通向现代 Transformer 思维的桥。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Irregular; archive is the product. New posts are rare post-2021.",
      cadenceZh: "不定期；价值在存量。2021 后新文很少。",
      howEn:
        "Treat it as a museum, not a feed. Pick one interactive essay, open it full-screen, play with the widgets. Do not rush — a single Distill piece can replace a week of half-understood blog posts.",
      howZh:
        "当博物馆，别当信息流。挑一篇交互长文全屏打开，动手拖控件。一篇 Distill 往往顶得过一周半懂不懂的博客。",
      timelineEn:
        "2017–21 golden era: feature viz, attention, GAN, circuits, activation atlases. After pause/restructuring, the back-catalog remains the curriculum. Pair with colah + modern mech-interp papers.",
      timelineZh:
        "2017–21 黄金期：特征可视化、Attention、GAN、circuits、activation atlas。暂停重组后，存量仍是课程。可搭配 colah 与当代机械可解释论文。",
      startHere: [
        {
          title: "Feature Visualization",
          url: "https://distill.pub/2017/feature-visualization/",
          noteEn: "What neurons 'want' to see.",
          noteZh: "神经元「想看到」什么。",
        },
        {
          title: "The Building Blocks of Interpretability",
          url: "https://distill.pub/2018/building-blocks/",
          noteEn: "Toolkit essay for reading nets.",
          noteZh: "读网络的工具箱长文。",
        },
        {
          title: "Attention and Augmented RNNs",
          url: "https://distill.pub/2016/augmented-rnns/",
          noteEn: "Pre-transformer attention intuition.",
          noteZh: "Transformer 之前的 Attention 直觉。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Blog sparse; real-time signal is X + YouTube (Neural Networks: Zero to Hero).",
      cadenceZh: "博客稀疏；实时信号在 X 与 YouTube（Zero to Hero 课程）。",
      howEn:
        "Read the classic essays for taste, then switch to the video series if you want to implement. Blog = worldview; YouTube = curriculum; GitHub (nanoGPT, llama.c) = homework.",
      howZh:
        "经典长文看品味，要动手就转视频课。博客 = 世界观；YouTube = 课程；GitHub（nanoGPT、llama.c）= 作业。",
      timelineEn:
        "2015–17: software 2.0, char-RNN, hacker's guide. Tesla years: less blogging. 2022+: education mode — nanoGPT, Zero to Hero, open recipes. Read old posts for philosophy; new media for practice.",
      timelineZh:
        "2015–17：Software 2.0、char-RNN、hacker guide。特斯拉时期博客少。2022+：教育模式 —— nanoGPT、Zero to Hero。旧文看哲学，新媒体看实践。",
      startHere: [
        {
          title: "Software 2.0",
          url: "https://karpathy.github.io/2017/06/13/software-2-0/",
          noteEn: "The essay that reframed ML as a new software stack.",
          noteZh: "把 ML 重新定义为新软件栈的那篇。",
        },
        {
          title: "The Unreasonable Effectiveness of RNNs",
          url: "https://karpathy.github.io/2015/05/21/rnn-effectiveness/",
          noteEn: "Char-RNN demos that hooked a generation.",
          noteZh: "迷住一代人的 char-RNN 演示。",
        },
        {
          title: "nanoGPT (GitHub)",
          url: "https://github.com/karpathy/nanoGPT",
          noteEn: "Companion code — train a GPT in a weekend.",
          noteZh: "配套代码 —— 一个周末训一个 GPT。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Steady Substack cadence — several posts / month, mix of deep dives and paper notes.",
      cadenceZh: "Substack 稳定更新，每月数篇，深读与论文笔记穿插。",
      howEn:
        "Subscribe on Substack. Use deep dives when learning a technique (LoRA, instruction tuning); use paper notes as a filter before reading arXiv. Pair with his free LLM book chapters when you want exercises.",
      howZh:
        "订 Substack。学具体技术（LoRA、指令微调）看深读；读 arXiv 前用论文笔记当过滤器。要练习可配他的免费 LLM 书章节。",
      timelineEn:
        "Pre-2022: classical ML / DL education (books + blog). 2023+: Ahead of AI focuses on LLM finetuning, open models, and translating papers for builders.",
      timelineZh:
        "2022 前：经典 ML/DL 教育（书 + 博客）。2023+：Ahead of AI 聚焦 LLM 微调、开源模型，把论文翻译给 builder。",
      startHere: [
        {
          title: "Ahead of AI magazine",
          url: "https://magazine.sebastianraschka.com/",
          noteEn: "Current home — start from the latest issues.",
          noteZh: "现在主阵地 —— 从最近几期开始。",
        },
        {
          title: "Finetuning LLMs guides",
          url: "https://sebastianraschka.com/blog/",
          noteEn: "Look for LoRA / instruction-tuning series.",
          noteZh: "搜 LoRA / 指令微调系列。",
        },
        {
          title: "Build a Large Language Model (book)",
          url: "https://github.com/rasbt/LLMs-from-scratch",
          noteEn: "Code-first companion if you want to implement.",
          noteZh: "想动手实现时的代码向配套。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Frequent technical posts; mix of derivations and implementation notes.",
      cadenceZh: "更新较勤；推导文与实现笔记穿插。",
      howEn:
        "If you read Chinese technical prose: subscribe via RSS. Search by keyword (RoPE, attention, loss) when stuck on a paper. Have pen and paper ready — many posts are derivation-first.",
      howZh:
        "订 RSS。被论文卡壳时按关键词搜（RoPE、Attention、损失）。准备纸笔 —— 很多是推导优先，不是鸡汤。",
      timelineEn:
        "Long-running archive covering classical NLP → Transformer internals → LLM tricks (RoPE, attention variants, optimizers). Newer posts track whatever the Chinese/open-source LLM community is wrestling with.",
      timelineZh:
        "长档：经典 NLP → Transformer 机理 → LLM 技巧（RoPE、Attention 变体、优化器）。新文跟着中文/开源 LLM 社区的痛点走。",
      startHere: [
        {
          title: "科学空间首页分类",
          url: "https://kexue.fm/",
          noteEn: "Browse by tag — Transformer / 优化 / 生成.",
          noteZh: "按分类逛 —— Transformer / 优化 / 生成。",
        },
        {
          title: "RoPE / 位置编码相关",
          url: "https://kexue.fm/",
          noteEn: "Search 旋转位置编码 — classic Su series.",
          noteZh: "搜「旋转位置编码」—— 苏神经典系列。",
        },
        {
          title: "RSS 订阅",
          url: "https://kexue.fm/feed",
          noteEn: "Best way to catch new derivations.",
          noteZh: "追新推导的最佳方式。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Occasional illustrated explainers; archive > feed.",
      cadenceZh: "不定期图解；存量比更新重要。",
      howEn:
        "Start with The Illustrated Transformer even if you 'already know' attention — the pictures stick. Then branch to GPT / BERT / Whisper illustrated posts. Use as onboarding for teammates new to NLP.",
      howZh:
        "就算你「已经懂」Attention，也先看 Illustrated Transformer —— 图会留在脑子里。再看 GPT / BERT / Whisper 图解。适合给 NLP 新人 onboarding。",
      timelineEn:
        "2018–20: illustrated Transformer / BERT / GPT-2 wave. Later: retrieval, Whisper, embedding model explainers. The core illustrated series is evergreen curriculum.",
      timelineZh:
        "2018–20：图解 Transformer / BERT / GPT-2 浪潮。之后：检索、Whisper、嵌入模型。核心图解系列是常青课。",
      startHere: [
        {
          title: "The Illustrated Transformer",
          url: "https://jalammar.github.io/illustrated-transformer/",
          noteEn: "The one everyone recommends first.",
          noteZh: "人人第一个推荐的那篇。",
        },
        {
          title: "The Illustrated GPT-2",
          url: "https://jalammar.github.io/illustrated-gpt2/",
          noteEn: "From attention to generative LMs.",
          noteZh: "从 Attention 到生成式 LM。",
        },
        {
          title: "The Illustrated Word2vec",
          url: "https://jalammar.github.io/illustrated-word2vec/",
          noteEn: "Embeddings before transformers.",
          noteZh: "Transformer 之前的嵌入直觉。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Thoughtful essays every few weeks to months; book-quality depth.",
      cadenceZh: "数周到数月一篇，接近写书的深度。",
      howEn:
        "Read when you are designing a system, not when chasing news. Her posts map cleanly to book chapters — use the blog as free samples, the book as the full curriculum. Great checklist material before an ML platform review.",
      howZh:
        "在设计系统时读，别在追热点时读。博客 ≈ 书的试读，正式课看 DMLS 原书。做 ML 平台 review 前当 checklist 很香。",
      timelineEn:
        "Early: ML education & career. Mid: Designing Machine Learning Systems era (data, features, deployment). Recent: LLM apps, evals, AI engineering trade-offs.",
      timelineZh:
        "早期：ML 教育与职业。中期：DMLS 时代（数据、特征、部署）。近期：LLM 应用、评测、AI 工程权衡。",
      startHere: [
        {
          title: "huyenchip.com essays",
          url: "https://huyenchip.com/blog/",
          noteEn: "Start from recent LLM/systems posts.",
          noteZh: "从最近的 LLM/系统文开始。",
        },
        {
          title: "Designing Machine Learning Systems",
          url: "https://www.amazon.com/Designing-Machine-Learning-Systems-Production-Ready/dp/1098107969",
          noteEn: "The book if you build production ML.",
          noteZh: "做生产 ML 必读书。",
        },
        {
          title: "LLM / AI Engineering notes",
          url: "https://huyenchip.com/",
          noteEn: "Search for evals, latency, RAG trade-offs.",
          noteZh: "搜评测、延迟、RAG 权衡。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Regular applied write-ups and reading lists.",
      cadenceZh: "稳定的应用向长文与书单。",
      howEn:
        "Follow for patterns, not hype. When building recsys / ranking / LLM features, search his archive first — he often has a battle-tested template. His 'what I read' lists are a high-signal filter.",
      howZh:
        "追模式，不追炒作。做推荐 / 排序 / LLM 功能前先搜他的档 —— 常有实战模板。「在读什么」清单是很好的过滤器。",
      timelineEn:
        "Recsys & applied ML years → MLOps patterns → LLM application design (RAG, agents-in-prod, evals). Consistent focus: what ships.",
      timelineZh:
        "推荐与应用 ML → MLOps 模式 → LLM 应用设计（RAG、生产 Agent、评测）。主线始终是：什么能上线。",
      startHere: [
        {
          title: "eugeneyan.com writing",
          url: "https://eugeneyan.com/writing/",
          noteEn: "Full archive by topic.",
          noteZh: "按主题的完整档。",
        },
        {
          title: "Applied LLM patterns",
          url: "https://eugeneyan.com/",
          noteEn: "Search RAG / eval / agents.",
          noteZh: "搜 RAG / 评测 / agents。",
        },
        {
          title: "RSS",
          url: "https://eugeneyan.com/rss/",
          noteEn: "Subscribe for new patterns.",
          noteZh: "订阅读新模式。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Near-daily notes + longer essays. High volume, high signal.",
      cadenceZh: "近乎每日笔记 + 不定期长文。量大、信噪比高。",
      howEn:
        "Do not try to read everything. Use the tag pages (llms, ai, datasette) or site search. Treat TILs as a toolbox; treat longer posts as design docs. Excellent for 'has anyone tried X with Claude/GPT yet?'",
      howZh:
        "别试图读完。用标签页（llms、ai、datasette）或站内搜索。TIL 当工具箱，长文当设计文档。特别适合问「有人用 Claude/GPT 试过 X 吗」。",
      timelineEn:
        "Long Datasette / data journalism era → 2022+ all-in on LLM tooling, prompt injection, local models, evals. Continuity: show your work, ship small tools.",
      timelineZh:
        "长期 Datasette / 数据新闻 → 2022+ 全面 LLM 工具、prompt injection、本地模型、评测。主线：展示过程、做小工具。",
      startHere: [
        {
          title: "LLM tag",
          url: "https://simonwillison.net/tags/llms/",
          noteEn: "Firehose of practical LLM notes.",
          noteZh: "实用 LLM 笔记消防栓。",
        },
        {
          title: "Prompt injection series",
          url: "https://simonwillison.net/series/prompt-injection/",
          noteEn: "Required reading if you ship LLM apps.",
          noteZh: "上线 LLM 应用前必读。",
        },
        {
          title: "Atom feed",
          url: "https://simonwillison.net/atom/everything/",
          noteEn: "Subscribe, skim titles daily.",
          noteZh: "订阅，每天扫标题即可。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Several Substack posts per month; some paywalled depth.",
      cadenceZh: "Substack 每月数篇，部分深度内容付费。",
      howEn:
        "Read free posts for the open-model meta; subscribe if you care about RLHF / post-training internals. Best consumed weekly — he narrates the research politics as it happens.",
      howZh:
        "免费文看开源模型大势；关心 RLHF / post-training 内幕再订阅。适合按周读 —— 他在实时叙述研究政治。",
      timelineEn:
        "Hugging Face / RLHF years → Interconnects as independent analyst → Ai2 (Tülu, OLMo) insider view on open post-training. Continuous thread: how open models actually get good.",
      timelineZh:
        "HF / RLHF 岁月 → Interconnects 独立分析 → Ai2（Tülu、OLMo）开源 post-training 内部视角。主线：开源模型如何变强。",
      startHere: [
        {
          title: "Interconnects home",
          url: "https://www.interconnects.ai/",
          noteEn: "Latest on open post-training.",
          noteZh: "开源 post-training 最新观察。",
        },
        {
          title: "RLHF / preference tuning posts",
          url: "https://www.interconnects.ai/",
          noteEn: "Search RLHF, DPO, reward models.",
          noteZh: "搜 RLHF、DPO、reward model。",
        },
        {
          title: "Feed",
          url: "https://www.interconnects.ai/feed",
          noteEn: "RSS for new issues.",
          noteZh: "RSS 追新。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Weekly podcast + written essays / year-in-review maps.",
      cadenceZh: "每周播客 + 长文 / 年度产业地图。",
      howEn:
        "Podcast for commute; essays for stack decisions. Their annual 'AI Engineer' maps are bookmark material. Skip hype episodes; prioritize founder/researcher interviews on infra, evals, and agents.",
      howZh:
        "播客通勤听；长文做技术栈决策。年度 AI Engineer 地图值得收藏。跳过注水期，优先听基建 / 评测 / Agent 的创始人与研究员访谈。",
      timelineEn:
        "2022–: AI Engineer identity forms. Essays codify RAG, agents, evals, GPU economics. Podcast is the continuous pulse; written year-reviews are the syllabus.",
      timelineZh:
        "2022–：AI Engineer 身份成形。长文沉淀 RAG、Agent、评测、GPU 经济。播客是脉搏，年度复盘是大纲。",
      startHere: [
        {
          title: "Latent Space",
          url: "https://www.latent.space/",
          noteEn: "Latest essays + podcast.",
          noteZh: "最新长文与播客。",
        },
        {
          title: "AI Engineer maps / year reviews",
          url: "https://www.latent.space/",
          noteEn: "Search 'year' or 'landscape'.",
          noteZh: "搜 year / landscape。",
        },
        {
          title: "Feed",
          url: "https://www.latent.space/feed",
          noteEn: "Subscribe to written posts.",
          noteZh: "订阅文字更新。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Occasional deep posts + course materials; quality over volume.",
      cadenceZh: "不定期深文 + 课程材料；重质不重量。",
      howEn:
        "Read when you are stuck on evals or LLMOps process. His writing assumes you ship products — expect checklists, anti-patterns, and tool reviews. Pair with his courses if you want structured practice.",
      howZh:
        "卡在评测或 LLMOps 流程时再读。默认你在上线产品 —— 期待 checklist、反模式、工具评测。要系统练习可配他的课程。",
      timelineEn:
        "Data science / MLOps consulting → LLM eval specialization (2023+). Consistent theme: measurement before magic.",
      timelineZh:
        "数据科学 / MLOps 咨询 → 2023+ 专攻 LLM 评测。主线：先度量，再谈魔法。",
      startHere: [
        {
          title: "hamel.dev",
          url: "https://hamel.dev/",
          noteEn: "Latest on evals & tooling.",
          noteZh: "评测与工具最新文。",
        },
        {
          title: "LLM evaluation posts",
          url: "https://hamel.dev/",
          noteEn: "Search eval, judge, rubric.",
          noteZh: "搜 eval、judge、rubric。",
        },
        {
          title: "Feed",
          url: "https://hamel.dev/feed.xml",
          noteEn: "RSS for new deep dives.",
          noteZh: "RSS 追深文。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Sparse, high-density essays.",
      cadenceZh: "更新少，密度极高。",
      howEn:
        "Read slowly. These are taste-forming essays about how to choose problems and evaluate claims — not tutorials. Best once a quarter when you need to recalibrate research priorities.",
      howZh:
        "慢读。这是关于如何选题、如何评估主张的品味文，不是教程。适合每季度需要校准研究方向时读。",
      timelineEn:
        "Academic research taste & forecasting → increasing focus on AI risk / responsible scaling as models jumped. Continuity: rigor over vibes.",
      timelineZh:
        "学术研究品味与预测 → 模型跃升后更多 AI 风险 / responsible scaling。主线：要严谨，不要 vibe。",
      startHere: [
        {
          title: "Bounded Regret",
          url: "https://bounded-regret.ghost.io/",
          noteEn: "Browse the full short archive.",
          noteZh: "短档可整站翻完。",
        },
        {
          title: "Research taste / forecasting essays",
          url: "https://bounded-regret.ghost.io/",
          noteEn: "Start with the most-cited titles on the home page.",
          noteZh: "从首页被引用最多的标题开始。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Regular opinionated essays; academic-blog rhythm.",
      cadenceZh: "稳定的观点长文，学术博客节奏。",
      howEn:
        "Read when the field feels overconfident. Recht is the cold shower after a hype cycle — useful for reviewing papers, evaluating benchmarks, and questioning optimization folklore. Not a how-to; a how-to-think.",
      howZh:
        "在领域过度自信时读。Recht 是炒作周期后的冷水 —— 适合审论文、看基准、质疑优化传说。不是 how-to，是 how-to-think。",
      timelineEn:
        "Optimization & learning theory roots → sustained critique of ML evaluation culture, reproducibility, and industrial research incentives through the deep learning boom.",
      timelineZh:
        "优化与学习理论出身 → 在深度学习热潮中持续批评评测文化、可复现性与工业研究激励。",
      startHere: [
        {
          title: "argmin.net",
          url: "https://www.argmin.net/",
          noteEn: "Latest critiques first.",
          noteZh: "先看最新批评。",
        },
        {
          title: "Feed",
          url: "https://www.argmin.net/feed",
          noteEn: "Subscribe for new essays.",
          noteZh: "订阅新长文。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Editorial magazine pace — several long pieces per month.",
      cadenceZh: "杂志节奏，每月数篇长文。",
      howEn:
        "Skim titles monthly; deep-read 1–2 that match your beat. Strong for interviews and field-level arguments you will not get from lab blogs. Good complement to primary papers.",
      howZh:
        "每月扫标题，深读 1–2 篇对口的。强项是访谈与领域级争论，实验室博客少见。适合配着原论文读。",
      timelineEn:
        "Long-running independent AI magazine spanning DL breakthroughs, ethics, industry structure, and research culture. Tone shifted with the field from pure research to socio-technical.",
      timelineZh:
        "长跑独立 AI 杂志，覆盖 DL 突破、伦理、产业结构与研究文化。随领域从纯研究转向社会技术议题。",
      startHere: [
        {
          title: "The Gradient",
          url: "https://thegradient.pub/",
          noteEn: "Latest long-form.",
          noteZh: "最新长文。",
        },
        {
          title: "RSS",
          url: "https://thegradient.pub/rss/",
          noteEn: "Magazine in your reader.",
          noteZh: "丢进阅读器。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Lab publication rhythm — tied to paper releases.",
      cadenceZh: "跟实验室发文节奏，论文驱动。",
      howEn:
        "Use as a paper companion: when a BAIR paper trends, read the blog post first for motivation and failure modes, then the PDF. Follow RSS; skip posts outside your subfield freely.",
      howZh:
        "当论文说明书：BAIR 论文火了先看博文（动机与翻车点），再看 PDF。订 RSS，子领域不相关的直接跳过。",
      timelineEn:
        "Covers the full BAIR portfolio over years: vision, robotics, RL, NLP/LLMs, systems. Each post is usually anchored to a specific paper or project.",
      timelineZh:
        "多年覆盖 BAIR 全谱：视觉、机器人、RL、NLP/LLM、系统。每篇通常锚定一篇论文或一个项目。",
      startHere: [
        {
          title: "BAIR Blog",
          url: "https://bair.berkeley.edu/blog/",
          noteEn: "Latest lab explainers.",
          noteZh: "实验室最新解读。",
        },
        {
          title: "Feed",
          url: "https://bair.berkeley.edu/blog/feed.xml",
          noteEn: "RSS by research interest.",
          noteZh: "按研究兴趣订 RSS。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Rare short posts; high impact when they land.",
      cadenceZh: "极少短文，一发即高影响。",
      howEn:
        "Read the whole (short) archive — it is finite. These posts crystallize ideas that later become standard vocabulary (CoT, emergent abilities). Pair each post with the corresponding paper.",
      howZh:
        "短档可以通读。这些文章把后来变成行话的概念（CoT、涌现）钉死。每篇配对应论文一起看。",
      timelineEn:
        "Google Brain era defining CoT / emergent abilities / scaling notes → OpenAI years with sparser personal blogging. The early posts are the canon.",
      timelineZh:
        "Google Brain 时期定义 CoT / 涌现 / scaling → OpenAI 时期个人博客更稀。早期几篇是 canon。",
      startHere: [
        {
          title: "Jason Wei blog",
          url: "https://www.jasonwei.net/blog",
          noteEn: "Read top to bottom.",
          noteZh: "建议从上到下读完。",
        },
        {
          title: "Chain-of-Thought related",
          url: "https://www.jasonwei.net/blog",
          noteEn: "Find the CoT / prompting notes.",
          noteZh: "找 CoT / prompting 笔记。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Course-driven posts + occasional opinion pieces.",
      cadenceZh: "课程驱动更新 + 不定期观点文。",
      howEn:
        "If new to DL: do the free course first, use blog posts as side quests. If experienced: read Jeremy's opinion pieces on ethics, education, and practical top-down learning. Code along in notebooks.",
      howZh:
        "DL 新人：先上免费课，博客当支线。有经验：看 Jeremy 关于伦理、教育、自顶向下学习的观点。一定要跟 notebook 敲。",
      timelineEn:
        "MOOC + top-down pedagogy era → fastai library iterations → continued advocacy for accessible, practical DL amid the LLM boom.",
      timelineZh:
        "MOOC + 自顶向下教学法 → fastai 库迭代 → LLM 浪潮中继续主张可及、实用的 DL。",
      startHere: [
        {
          title: "fast.ai courses",
          url: "https://www.fast.ai/",
          noteEn: "The actual on-ramp.",
          noteZh: "真正的入门主线。",
        },
        {
          title: "Blog posts",
          url: "https://www.fast.ai/posts/",
          noteEn: "Opinion + practical notes.",
          noteZh: "观点 + 实践笔记。",
        },
        {
          title: "Feed",
          url: "https://www.fast.ai/posts/index.xml",
          noteEn: "RSS for new posts.",
          noteZh: "RSS 追新。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Living documents — pages updated for years, not daily posts.",
      cadenceZh: "活文档：页面常年修订，不是日更博客。",
      howEn:
        "Never binge. Open one page, follow footnotes only when needed, budget an evening. Use site search for 'scaling', 'GPT', 'DNN'. Treat as a reference library that occasionally rewires your priors.",
      howZh:
        "绝不连刷。打开一页，必要时再跟脚注，留一晚上。站内搜 scaling / GPT / DNN。当会改写先验的参考图书馆。",
      timelineEn:
        "Long pre-LLM essays on statistics, culture, self-experiment → increasingly central AI/scaling/DNN pages as models scaled. Many pages are continuously revised rather than versioned as posts.",
      timelineZh:
        "早期统计、文化、自我实验 → 模型 scaling 后 AI/DNN 页面越来越核心。许多是持续修订的页面，而非一篇篇定稿。",
      startHere: [
        {
          title: "gwern.net",
          url: "https://gwern.net/",
          noteEn: "Start from the AI / DL hub pages.",
          noteZh: "从 AI / DL 枢纽页进入。",
        },
        {
          title: "Scaling / DNN essays",
          url: "https://gwern.net/",
          noteEn: "Search scaling laws, GPT.",
          noteZh: "搜 scaling laws、GPT。",
        },
        {
          title: "Atom",
          url: "https://gwern.net/atom.xml",
          noteEn: "Updates when pages change.",
          noteZh: "页面修订时的更新流。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "High frequency — model drops, course chapters, ecosystem news.",
      cadenceZh: "高频：模型发布、课程章节、生态新闻。",
      howEn:
        "Filter aggressively. Follow for model release notes and official how-tos (PEFT, text-gen inference, diffusers). Skip pure marketing. Use tags + RSS; open the linked Hub model card immediately after reading.",
      howZh:
        "狠心过滤。追模型发布说明与官方 how-to（PEFT、推理、diffusers）。跳过纯营销。用标签 + RSS；读完立刻打开对应 Hub model card。",
      timelineEn:
        "Library tutorials (transformers, datasets) → LLM era model launches, alignment, on-device, agents tooling. Always closest to whatever the open-source ecosystem just shipped.",
      timelineZh:
        "库教程（transformers、datasets）→ LLM 时代的模型发布、对齐、端侧、Agent 工具。永远贴近开源生态刚上线的东西。",
      startHere: [
        {
          title: "HF Blog",
          url: "https://huggingface.co/blog",
          noteEn: "Latest official posts.",
          noteZh: "官方最新文。",
        },
        {
          title: "Course / tutorial tracks",
          url: "https://huggingface.co/learn",
          noteEn: "Structured learning path.",
          noteZh: "结构化学习路径。",
        },
        {
          title: "Feed",
          url: "https://huggingface.co/blog/feed.xml",
          noteEn: "RSS, then filter in reader.",
          noteZh: "RSS，在阅读器里过滤。",
        },
      ],
    },
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
    guide: {
      cadenceEn: "Research-driven posts tied to releases and papers.",
      cadenceZh: "研究驱动，跟发布与论文走。",
      howEn:
        "Read for open-model history and eval philosophy. Essential context if you work on GPT-NeoX, Pythia, or open pretraining. Pair posts with the model cards and GitHub repos they announce.",
      howZh:
        "看开源模型史与评测哲学。做 GPT-NeoX / Pythia / 开源预训练时的必读语境。博文配 model card 与 GitHub 一起看。",
      timelineEn:
        "GPT-Neo / NeoX era (replicable large LMs) → Pythia / scaling laws / interpretability → ongoing open science on evals and alignment-adjacent work.",
      timelineZh:
        "GPT-Neo / NeoX（可复现大模型）→ Pythia / scaling / 可解释性 → 持续的开源评测与对齐相邻工作。",
      startHere: [
        {
          title: "EleutherAI Blog",
          url: "https://blog.eleuther.ai/",
          noteEn: "Start with model release posts.",
          noteZh: "从模型发布文读起。",
        },
        {
          title: "Pythia / eval posts",
          url: "https://blog.eleuther.ai/",
          noteEn: "Search Pythia, evaluation.",
          noteZh: "搜 Pythia、evaluation。",
        },
        {
          title: "Feed",
          url: "https://blog.eleuther.ai/index.xml",
          noteEn: "RSS for lab updates.",
          noteZh: "RSS 追实验室更新。",
        },
      ],
    },
  },
];

async function main() {
  console.log(`Seeding ${sources.length} sources...`);
  for (const s of sources) {
    await prisma.source.upsert({
      where: { slug: s.slug },
      create: { ...s, enabled: DEFAULT_ENABLED_SOURCE_SLUGS.has(s.slug) },
      update: {
        name: s.name,
        url: s.url,
        homepage: s.homepage,
        type: s.type,
        lang: s.lang,
        weight: s.weight,
        category: s.category,
        enabled: DEFAULT_ENABLED_SOURCE_SLUGS.has(s.slug),
      },
    });
    console.log(`  ✓ ${s.slug}`);
  }

  console.log(`Seeding ${blogs.length} curated blogs (+ reading guides)...`);
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
      guideCadenceEn: b.guide.cadenceEn,
      guideCadenceZh: b.guide.cadenceZh,
      guideHowEn: b.guide.howEn,
      guideHowZh: b.guide.howZh,
      guideTimelineEn: b.guide.timelineEn,
      guideTimelineZh: b.guide.timelineZh,
      guideStartHere: b.guide.startHere,
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
