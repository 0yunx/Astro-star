---
routeSlug: 9
title: 深度解析 AI API 里的 后缀
type: 分享
createdAt: "2026-07-18 00:07:00"
updatedAt: "2026-07-18 00:07:00"
---
# 深度解析 AI API 里的 `/v1/messages`、`/v1/chat/completions`、`/v1/responses`：这些后缀到底是什么，为什么要这样设计？


链接: https://linux.do/t/2306861

我们经常看到下面这种样子的 URL 后缀

```plaintext
/v1/chat/completions
/v1/responses
/v1/messages
/v1/embeddings
/v1/models
/v1beta/models/{model}:generateContent
/openai/v1/chat/completions
/api/v1/chat/completions
```

总的来说，这些是模型厂商给模型能力规定的一个接口协议。后缀规定了某一模型用哪种具体的协议与它进行沟通。

例如：

```plaintext
https://api.openai.com/v1/chat/completions
        └────────────┬────────────┘
                 API Base URL
                         └─ /v1              API 协议版本
                            └─ /chat         聊天
                                  └─ /completions  生成聊天补全
```

这里的 `/v1` 约束了请求字段、响应字段、错误格式、流式事件格式、工具调用格式等接口规范。

同一个模型也可能支持不同接口协议。比如某个 OpenAI 模型可能既能通过 `/v1/chat/completions` 调用，也能通过 `/v1/responses` 调用。

反过来，同一个 `/v1/chat/completions` 协议也可能被 OpenAI、Mistral、xAI、DeepSeek、Groq、OpenRouter等不同平台支持，但它们的兼容程度并不完全一致。

所以在这里，我打算从协议的设计、GPT 规范的演进，以及工程和主流厂商的不同角度，基于我的理解，解释 API 这个路径到底是什么，以及为什么我们这么写这个东西。

总览一下

```plaintext
/completions          文本续写
/chat/completions     聊天回复
/messages             消息处理
/responses            多模态、多工具、多事件的响应
generateContent       内容生成资源上的一个方法
/embeddings           向量化
/models               可查询的资源
```

从工程角度看，这些接口协议本质上规定了一套请求和响应的数据结构，以及围绕它们的鉴权、错误、流式输出和工具调用规范。

`/v1/chat/completions` 的核心是 `messages` 数组和 `choices` 返回值。

`/v1/messages` 的核心是 Anthropic 风格的 message 对象、content block、stop_reason。

`/v1/responses` 的核心是更通用的 input、output、items、tools、stateful response。

Gemini 的 `models/{model}:generateContent` 则是 Google API 风格：对某个模型资源执行 `generateContent` 方法。

API 的本质上就是确认调用的平台支持哪一种规范，然后依照这个规范给平台发送你的请求，并收到对应的回复。

---

## /v1/completions

早期的大语言模型是文本补全类型，用户传入一段 prompt，然后让模型继续补全。

一个典型的接口和请求可以如下表示。

```http
POST /v1/completions
```

```json
{
  "model": "chatgpt",
  "prompt": "Translate this sentence into Chinese: Hello, how are you?"
}
```

模型什么都不知道，它的作用就是看到一段字符串，然后预测后面可能的文本。它并不像现在的模型一样知道什么是系统消息，什么是用户发出的，什么是助手消息。

如果我们要将其作为对话，那么我们需要自行拼接文本，也就是下面这个表示。

```plaintext
System: You are a helpful assistant.
User: Hello.
Assistant: Hi, how can I help?
User: Explain API suffixes.
Assistant:
```

这里有一个弊端，就是模型需要通过输入的文本来猜测哪一部分是系统发出的，哪一部分是用户的输入，这时就给了破限更多的机会。还有一个问题就是，你对话的历史不能结构化的输出。所有的上下文都在这整个输入中。当遇见了工具的调用，或者说多模态（比如视频、图片、声音的输入）时，就很难优雅地进行沟通。

为了将文本续写功能发展成一种能进行操作和对话的助手。`/completions` 逐渐变成旧式接口。

官方资源：

OpenAI Completions / Legacy 相关参考：

      ![](https://cdn3.ldstatic.com/original/4X/d/9/e/d9e01e46a6d9bad6ebf65740192e9fa624cf66f6.svg)
    
      [OpenAI API Reference](https://developers.openai.com/api/reference/resources/completions)

### Completions

---

## /v1/chat/completions

`/v1/chat/completions` 是过去几年最重要、最广泛兼容的 LLM API 协议。

接口和请求如下：

```http
POST /v1/chat/completions
```

```json
{
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "system",
      "content": "You are a concise technical explainer."
    },
    {
      "role": "user",
      "content": "Explain what /v1/chat/completions means."
    }
  ]
}
```

这时接口，从一个整体的 prompt 输入变成了一个可以结构化进行处理的消息数组。

### 1. messages 是 Chat Completions 的核心

`messages` 通常包含这些角色：

```plaintext
system      系统指令，定义模型行为边界
user        用户输入
assistant   模型之前的回复
tool        工具调用结果
```

这让对话变得结构化。

也避免了我们需要手动提示 AI 下面这些内容。

```plaintext
User:
Assistant:
System:
```

我们可以把每条消息作为对象传进去。

上下文从字符串变成了一组具有角色和顺序的一串消息组。

### 2. 兼容 /v1/chat/completions

`/v1/chat/completions` 算是一种行业上通用的协议。

```plaintext
OpenAI:       /v1/chat/completions
Mistral:      /v1/chat/completions
xAI:          /v1/chat/completions
DeepSeek:     /chat/completions 或 OpenAI 兼容路径
Groq:         /openai/v1/chat/completions
OpenRouter:   /api/v1/chat/completions
Together AI:  /v1/chat/completions
```

由于这个基础设施已经很完善了，不管是 SDK 还是 AI 的各种 IDE，前端的一些聊天软件还有一些 RAG 框架都支持了这个 OpenAI 的 Chat Completions，所以我们如果直接用这个基础设施的话，我们就只需要改 Base URL、API key 和模型就好了，也就是下面这些。

```plaintext
base_url
api_key
model
```

例如原来调用 OpenAI：

```python
from openai import OpenAI

client = OpenAI(
    api_key="OPENAI_API_KEY",
    base_url="https://api.openai.com/v1"
)

response = client.chat.completions.create(
    model="gpt-5.5",
    messages=[
        {"role": "user", "content": "Hello"}
    ]
)
```

切换到某个 OpenAI-compatible 服务时，常常只需要改成：

```python
client = OpenAI(
    api_key="OTHER_PROVIDER_API_KEY",
    base_url="https://api.other-provider.com/v1"
)
```

但是这里的兼容并不意味着完全的兼容。只是在一些方面，用户可以比较轻松地使用而已。

### 3. OpenAI-compatible 的兼容程度有层级

兼容 OpenAI API，通常至少意味着它支持：

```plaintext
POST /v1/chat/completions
model
messages
temperature
max_tokens 或 max_completion_tokens
stream
choices[0].message.content
```

但不一定完整支持：

```plaintext
tools
tool_choice
parallel_tool_calls
response_format
JSON schema strict mode
vision input
audio input/output
logprobs
reasoning tokens
cached tokens
streaming tool-call delta
structured outputs
```

所以兼容可以分层理解：

```plaintext
Level 1：普通文本聊天兼容
Level 2：支持流式输出
Level 3：支持函数调用 / 工具调用
Level 4：支持结构化输出
Level 5：支持多模态输入
Level 6：支持复杂 agent 事件流和状态管理
```

官方资源：

OpenAI Chat Completions：

      ![](https://cdn3.ldstatic.com/original/4X/d/9/e/d9e01e46a6d9bad6ebf65740192e9fa624cf66f6.svg)
    
      [OpenAI API Reference](https://developers.openai.com/api/reference/resources/chat)

### Chat

Mistral Chat API：

      ![](https://cdn3.ldstatic.com/original/4X/2/2/6/226eed08bf498708d99209d02421ed3db0ccdb59.png)
    
      [docs.mistral.ai](https://docs.mistral.ai/api)

### Chat

  Welcome to Mistral AI's Api Reference

xAI Chat Completions：

      ![](https://cdn3.ldstatic.com/original/4X/b/d/c/bdce82a21992bb5f91771dca1e6f3f595bac1c6f.png)
    
      [docs.x.ai](https://docs.x.ai/developers/rest-api-reference/inference/chat)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/4/3/0/43016680da9bec2e6ed7e4a9156f1ea205d501af_2_690x362.jpeg)

### Chat | Inference API - REST API Reference | xAI Docs

  Chat and Responses API endpoints

DeepSeek Chat Completion：

      ![](https://cdn3.ldstatic.com/original/4X/c/5/c/c5c46fad3cc452b7763024f8d06b3f60e8a6ae24.svg)
    
      [api-docs.deepseek.com](https://api-docs.deepseek.com/api/create-chat-completion/)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/6/1/a/61a41a97b108dde0cc6515f32fb59f75b7a86dd2_2_690x366.jpeg)

### Create Chat Completion | DeepSeek API Docs

  Creates a model response for the given chat conversation.

Groq OpenAI Compatibility：

      ![](https://cdn3.ldstatic.com/original/4X/a/a/b/aabf6a606f27ad3ceca8690d78680c02a7436627.png)
    
      [GroqDocs](https://console.groq.com/docs/openai)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/2/5/9/2599196da5db9007204b96a4ec2046b95ca33078_2_690x362.jpeg)

### OpenAI Compatibility - GroqDocs

  Learn how to use OpenAI's client libraries with Groq API, including configuration, supported features, and limitations.

OpenRouter Chat Completion：

      ![](https://cdn3.ldstatic.com/original/4X/0/0/0/0008d2ee847563810c50b212df53996525b29033.png)
    
      [openrouter.ai](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)

### Create a chat completion | OpenRouter | Documentation

  Sends a request for a model response for the given chat conversation. Supports both streaming and non-streaming modes.

---

## /v1/messages，Claude 的消息协议

Anthropic Claude 的核心接是下面这个，各个模型厂商都希望推出自己的一些协议，让别人来兼容它。说的就是你 A​![:divide:](https://cdn.ldstatic.com/images/emoji/twemoji/divide.png?v=15)

```http
POST /v1/messages
```

```json
{
  "model": "claude-sonnet-4-8",
  "max_tokens": 1024,
  "system": "You are a careful technical explainer.",
  "messages": [
    {
      "role": "user",
      "content": "Explain /v1/messages."
    }
  ]
}
```

看起来像，但是不是一个东西。

### 1. Claude 的 system 通常是顶层字段

OpenAI Chat Completions 常见写法：

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are helpful."
    },
    {
      "role": "user",
      "content": "Hello."
    }
  ]
}
```

Anthropic Messages 常见写法：

```json
{
  "system": "You are helpful.",
  "messages": [
    {
      "role": "user",
      "content": "Hello."
    }
  ]
}
```

Claude 把系统指令作为顶层参数，而 OpenAI 则是将其设为了普通消息数组中的一个 role。

### 2. Claude 的 content 更强调 block 结构

Claude Messages API 的内容可以是字符串，也可以是 content blocks。例如文本、图片、工具调用结果等都可以作为不同 block 表达。

响应结构也不同。

OpenAI Chat Completions 常见解析路径是：

```plaintext
choices[0].message.content
```

Claude Messages 常见解析路径更接近：

```plaintext
content[0].text
```

响应里还会有：

```plaintext
type
role
content
stop_reason
usage.input_tokens
usage.output_tokens
```

所以 OpenAI 和 Claude 的接口不能通用，我们必须想一个办法把它进行转换一下才可以。

官方资源：

Anthropic Messages API：

      ![](https://cdn3.ldstatic.com/original/4X/5/4/8/5484c4122088856dcd2b9ca61a1893f4cda6e68f.png)
    
      [Claude API Reference](https://platform.claude.com/docs/en/api/messages)
    
    ![](https://cdn3.ldstatic.com/original/4X/2/9/9/2991017c3726b1a1069d26da6bee522b393aa662.png)

### Messages - Claude API Reference

  API reference for Messages endpoints

Anthropic Messages 使用指南：

      ![](https://cdn3.ldstatic.com/original/4X/5/4/8/5484c4122088856dcd2b9ca61a1893f4cda6e68f.png)
    
      [Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/working-with-messages)
    
    ![](https://cdn3.ldstatic.com/original/4X/8/9/e/89e4e334a1c7c221e96bb075dcf29613cff9c228.png)

### Using the Messages API

  Practical patterns and examples for using the Messages API effectively

Anthropic Streaming Messages：

      ![](https://cdn3.ldstatic.com/original/4X/5/4/8/5484c4122088856dcd2b9ca61a1893f4cda6e68f.png)
    
      [Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/streaming)
    
    ![](https://cdn3.ldstatic.com/original/4X/c/0/d/c0d95b4d23166336c21394620c42d5ecc2a29a8d.png)

### Streaming messages

  Claude API Documentation

---

## /v1/responses，统一响应对象

OpenAI 的 `/v1/responses` 则给出了更现代化的统一接口。

从

```http
POST /v1/responses
```

```json
{
  "model": "gpt-5.5",
  "input": "Explain why /v1/responses exists."
}
```

转变为更结构化的请求：

```json
{
  "model": "gpt-5.5",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "Search the web and summarize the result."
        }
      ]
    }
  ],
  "tools": [
    {
      "type": "web_search"
    }
  ]
}
```

### 1. 为什么需要 Responses API

`/v1/chat/completions` 的名字里有两个历史词：

```plaintext
chat
completions
```

作为原来的开发者，他们认为用户给一段聊天历史，然后 AI 来补全下一条信息。但是现在的模型并不仅仅只是聊天了，它还有更多的事情需要做。

```plaintext
读取图片
处理音频
查询文件
搜索网页
调用函数
使用代码解释器
调用 MCP 工具
维护服务端上下文
输出结构化 JSON
返回推理摘要
产生多个中间事件
```

如果我们把这些能力全部塞进 `chat.completion` 这个对象，会越来越别扭。

OpenAI 在 Responses API 中设计了一套更通用的数据结构，用于包含各种文本工具调用、工具返回的结果以及一些状态信息等，让这个内容更加抽象和宽广。

### 2. Chat Completions 与 Responses 的核心差异

可以这样理解：

```plaintext
Chat Completions:
输入是一组 messages。
输出通常是一条 assistant message。

Responses:
输入是 input / items。
输出是 response object，里面可以有多个 output item。
```

Chat Completions 更像：

```plaintext
用户：这是聊天记录
模型：这是下一条回复
```

Responses 更像：

```plaintext
用户：这是任务、上下文和可用工具
模型：这是我执行后的完整响应，包括文本、工具调用和中间结果
```

这更适合 agent 场景。

### 3. 为什么新项目更应该关注 /v1/responses

如果只是做简单聊天，`/v1/chat/completions` 仍然非常实用，因为生态兼容性最好。

但如果涉及以下能力：

```plaintext
工具调用
网页搜索
文件搜索
代码解释器
多模态输入
复杂流式事件
服务端状态
agent workflow
```

那么更应该优先研究 Responses API。

官方资源：

OpenAI Responses API：

      ![](https://cdn3.ldstatic.com/original/4X/d/9/e/d9e01e46a6d9bad6ebf65740192e9fa624cf66f6.svg)
    
      [OpenAI API Reference](https://developers.openai.com/api/reference/resources/responses)

### Responses

OpenAI Chat Completions 与 Responses 迁移指南：

      ![](https://cdn3.ldstatic.com/original/4X/4/e/6/4e6c215b527d954515a2695f3754a6bce3aa56f7.png)
    
      [developers.openai.com](https://developers.openai.com/api/docs/guides/migrate-to-responses)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/0/7/b/07bb0ef53734084977d79628e2f4ec88cf92ec24_2_690x362.jpeg)

### Migrate to the Responses API | OpenAI API

---

## Google Gemini models/{model}:generateContent

Gemini 的 REST API 路径经常长这样：

```http
POST /v1beta/models/{model}:generateContent
```

或者：

```http
POST /v1/models/{model}:generateContent
```

这和 OpenAI、Anthropic 的命名风格明显不同。

拆开看：

```plaintext
/v1beta
API 版本

/models/{model}
模型资源

:generateContent
对这个模型资源执行 generateContent 方法
```

这里反映的是对某个模型的资源执行内容的生成方法，而不是访问某一个服务。

### 1. v1 和 v1beta 的区别

文档明确区分：

```plaintext
v1       稳定 API 版本
v1beta   Beta / 预览能力，可能变化
```

### 2. Gemini 的数据结构也不同

Gemini 通常使用 `contents`、`parts` 这类结构，而不是 OpenAI 风格的 `messages`。

概念上可以理解为：

```plaintext
OpenAI Chat Completions:
messages -> role + content

Anthropic Messages:
messages -> role + content blocks

Gemini:
contents -> role + parts
```

官方资源：

Gemini API Versions：

      ![](https://cdn3.ldstatic.com/original/3X/b/2/b2a2be7cc9c7442d916d15b4c40049e353cd51bf.png)
    
      [Google AI for Developers](https://ai.google.dev/gemini-api/docs/api-versions?hl=zh-cn)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/b/d/b/bdbce41a52214eeb554a6c7c59f1d7b1bf35cdac_2_690x388.jpeg)

### API 版本说明 | Gemini API | Google AI for Developers

Gemini Generate Content API：

      ![](https://cdn3.ldstatic.com/original/3X/b/2/b2a2be7cc9c7442d916d15b4c40049e353cd51bf.png)
    
      [Google AI for Developers](https://ai.google.dev/api/generate-content?hl=zh-cn)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/b/d/b/bdbce41a52214eeb554a6c7c59f1d7b1bf35cdac_2_690x388.jpeg)

### Generating content | Gemini API | Google AI for Developers

Gemini API 文档首页：

      ![](https://cdn3.ldstatic.com/original/3X/b/2/b2a2be7cc9c7442d916d15b4c40049e353cd51bf.png)
    
      [Google AI for Developers](https://ai.google.dev/gemini-api/docs?hl=zh-cn)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/b/d/b/bdbce41a52214eeb554a6c7c59f1d7b1bf35cdac_2_690x388.jpeg)

### Gemini API | Google AI for Developers

  Gemini API 文档和 API 参考文档

---

## /v1/embeddings 向量接口

`/v1/embeddings` 经常和聊天 API 一起出现

```http
POST /v1/embeddings
```

```json
{
  "model": "text-embedding-3-large",
  "input": "AI API suffixes explained"
}
```

这个会将文本生成一组浮点数向量进行返回。

```json
{
  "data": [
    {
      "embedding": [0.0123, -0.0456, 0.0789]
    }
  ]
}
```

Embedding 的作用是把文本变成向量。它常用于：

```plaintext
语义搜索
RAG 检索
相似度匹配
聚类
推荐
去重
分类
```

例如做 RAG 时，典型流程是：

```plaintext
1. 用 /v1/embeddings 把文档切片转成向量
2. 存入向量数据库
3. 用户提问时，把问题也转成向量
4. 检索最相似的文档片段
5. 把片段塞进 /v1/chat/completions 或 /v1/responses 生成答案
```

embeddings 负责找资料

官方资源：

OpenAI Embeddings Guide：

      ![](https://cdn3.ldstatic.com/original/4X/4/e/6/4e6c215b527d954515a2695f3754a6bce3aa56f7.png)
    
      [developers.openai.com](https://developers.openai.com/api/docs/guides/embeddings)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/6/5/1/651f50e259a3779dd9e79d5d173b1b454559b699_2_690x362.jpeg)

### Vector embeddings | OpenAI API

  Learn how to turn text into numbers, unlocking use cases like search, clustering, and more with OpenAI API embeddings.

OpenAI Embeddings API Reference：

      ![](https://cdn3.ldstatic.com/original/4X/d/9/e/d9e01e46a6d9bad6ebf65740192e9fa624cf66f6.svg)
    
      [OpenAI API Reference](https://developers.openai.com/api/reference/resources/embeddings)

### Embeddings

---

## /v1/models 模型列表

`/v1/models` 通常用于列出可用模型或查询模型详情。

```http
GET /v1/models
GET /v1/models/{model}
```

这个就很简单，他告诉调用的软件或者程序有哪些模型，哪个模型是不是存在，模型的 ID 是什么，还有它的一些消耗是怎么样的。

```plaintext
列出账号可用模型
检查模型名称是否正确
动态展示模型选择列表
调试 404 model_not_found 问题
```

官方资源：

OpenAI Models API：

      ![](https://cdn3.ldstatic.com/original/4X/d/9/e/d9e01e46a6d9bad6ebf65740192e9fa624cf66f6.svg)
    
      [OpenAI API Reference](https://developers.openai.com/api/reference/resources/models)

### Models

---

## 为什么一定要有 /v1

很多人会误以为：

```plaintext
/v1 = 第一代模型
/v2 = 第二代模型
```

这是错的。

`/v1` 是 API 版本，不是模型版本。

API 版本约束的是：

```plaintext
请求字段叫什么
响应字段叫什么
错误格式是什么
流式事件怎么发
工具调用怎么表达
鉴权方式是什么
文件上传格式是什么
```

模型版本约束的是：

```plaintext
模型能力
模型大小
上下文长度
推理能力
价格
速度
多模态能力
```

例如：

```plaintext
API 版本：/v1
模型版本：gpt-5.5、claude-sonnet-4-8、gemini-3.5-pro
SDK 版本：openai Python SDK 1.x、2.x
协议风格：OpenAI-compatible、Anthropic-compatible、Gemini-compatible
```

这四个不是一回事。

API 的版本只是为了让后面的新规范兼容前面的规范，而不破坏之前的应用使用。

```json
{
  "choices": [
    {
      "message": {
        "content": "Hello"
      }
    }
  ]
}
```

如果明天厂商直接改成：

```json
{
  "output": [
    {
      "content": [
        {
          "text": "Hello"
        }
      ]
    }
  ]
}
```

就会出问题。

所以厂商通常不会随便改变同一个稳定 API 版本的核心结构。要么新开一个版本，比如 `/v2`，要么新增一套接口，比如 `/v1/responses`。

---

## /openai、/api、/compatible-mode

很多第三方平台不是 OpenAI，但为了兼容 OpenAI SDK，会设计类似路径：

```plaintext
https://api.groq.com/openai/v1/chat/completions
https://openrouter.ai/api/v1/chat/completions
https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
```

这些路径里的 `/openai`、`/compatible-mode`、`/api` 通常是平台自己的命名空间。

它们表达的是：

```plaintext
这不是 OpenAI 官方服务
但这里提供一套接近 OpenAI 协议的兼容入口
```

例如 Groq 的 base URL 是：

```plaintext
https://api.groq.com/openai/v1
```

OpenRouter 的 chat completions 路径是：

```plaintext
https://openrouter.ai/api/v1/chat/completions
```

这类平台一般希望开发者继续使用 OpenAI SDK：

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="OPENROUTER_API_KEY"
)
```

然后再调用：

```python
client.chat.completions.create(...)
```

SDK 内部会把 `/chat/completions` 拼到 base URL 后面。

---

## Base URL 和 Endpoint

### 1. 如果软件让你填 Base URL

通常应该填到 `/v1` 为止：

```plaintext
https://api.openai.com/v1
https://api.groq.com/openai/v1
https://openrouter.ai/api/v1
```

不要填完整的：

```plaintext
https://api.openai.com/v1/chat/completions
```

因为 SDK 会自动拼接 `/chat/completions`。

如果你把完整 endpoint 填进 base_url，实际请求可能变成：

```plaintext
https://api.openai.com/v1/chat/completions/chat/completions
```

然后报 404。

### 2. 如果软件让你填 Endpoint / Full URL

那就需要填完整路径：

```plaintext
https://api.openai.com/v1/chat/completions
```

### 3. 判断配置项的经验规则

```plaintext
Base URL / API Base / OpenAI Base URL:
填到 /v1，一般不要带 /chat/completions。

Endpoint / Full URL / Request URL:
填完整路径。

Provider:
选择协议类型，例如 OpenAI、Anthropic、Gemini。

Model:
填模型 ID，不要填 URL。
```

---

## 不同接口的响应结构不同，解析代码不能混用

### 1. OpenAI Chat Completions 常见响应

```json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 5,
    "total_tokens": 15
  }
}
```

常见解析路径：

```python
text = response.choices[0].message.content
```

### 2. Anthropic Messages 常见响应

```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello"
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 5
  }
}
```

常见解析路径：

```python
text = response.content[0].text
```

### 3. OpenAI Responses 常见响应

```json
{
  "id": "resp_xxx",
  "object": "response",
  "output": [
    {
      "type": "message",
      "content": [
        {
          "type": "output_text",
          "text": "Hello"
        }
      ]
    }
  ]
}
```

常见解析路径取决于 SDK，可能是：

```python
text = response.output_text
```

或者手动遍历：

```python
for item in response.output:
    ...
```

---

## 流式输出也不是统一格式

很多接口都支持：

```json
{
  "stream": true
}
```

但流式事件格式并不相同。

OpenAI Chat Completions 通常是：

```plaintext
data: {"choices":[{"delta":{"content":"Hel"}}]}
data: {"choices":[{"delta":{"content":"lo"}}]}
data: [DONE]
```

Anthropic Messages 可能是：

```plaintext
event: message_start
event: content_block_start
event: content_block_delta
event: content_block_stop
event: message_stop
```

Responses API 也有自己的事件类型。

---

## 工具调用

普通聊天只需要输出文本，但 agent 应用需要模型调用工具。

例如用户问：

```plaintext
查一下今天武汉天气，再帮我决定要不要带伞。
```

模型可能要：

```plaintext
1. 判断需要天气工具
2. 生成 tool call
3. 工具返回天气数据
4. 模型读取工具结果
5. 生成最终建议
```

在 Chat Completions 里，工具调用通常通过 `tools`、`tool_calls`、`tool` role 表达。

在 Claude Messages 里，工具使用是 content block 的一部分。

在 Responses API 里，工具调用和工具结果更像 response item / output item 的一部分，更适合复杂事件流。

如果你要构建复杂 agent，我们需要考虑到：

```plaintext
工具调用格式
是否支持并行工具调用
是否支持流式工具调用
是否支持服务端状态
是否支持内置工具
是否支持 MCP
是否支持结构化输出
是否支持错误恢复
```

---

## 主流 AI 厂商接口路径对照表

| 厂商 / 平台 | 常见接口路径 | 协议风格 | 主要用途 |
| --- | --- | --- | --- |
| OpenAI | `/v1/responses` | OpenAI 新一代统一响应协议 | 文本、多模态、工具、agent、新项目优先关注 |
| OpenAI | `/v1/chat/completions` | OpenAI Chat Completions | 传统聊天、兼容生态、普通对话 |
| OpenAI | `/v1/embeddings` | Embeddings | 文本向量化、RAG、搜索 |
| OpenAI | `/v1/models` | Models | 查询模型列表 |
| Anthropic Claude | `/v1/messages` | Anthropic Messages | Claude 原生对话、工具、多模态 |
| Google Gemini | `/v1/models/{model}:generateContent` | Google generateContent | Gemini 稳定接口 |
| Google Gemini | `/v1beta/models/{model}:generateContent` | Google beta generateContent | Gemini 预览能力 |
| Mistral | `/v1/chat/completions` | OpenAI-like Chat Completions | 聊天、工具调用、结构化输出 |
| xAI | `/v1/chat/completions` | OpenAI-like Chat Completions | Grok 文本 / 图像理解聊天 |
| DeepSeek | `/chat/completions` 或兼容 OpenAI 路径 | OpenAI-like Chat Completions | DeepSeek 对话模型 |
| Groq | `/openai/v1/chat/completions` | OpenAI-compatible | 高速推理，复用 OpenAI SDK |
| OpenRouter | `/api/v1/chat/completions` | OpenAI-compatible aggregator | 多模型聚合路由 |

---

## 如何选择该用哪个接口

可以按场景判断。

### 1. 只是普通聊天

优先选：

```plaintext
/v1/chat/completions
```

原因是生态最成熟，SDK、代理、网关、前端工具兼容最好。

### 2. 新项目接 OpenAI，并且需要现代能力

优先研究：

```plaintext
/v1/responses
```

尤其是涉及：

```plaintext
工具调用
文件搜索
网页搜索
多模态
结构化输出
agent workflow
服务端状态
```

### 3. 接 Claude 官方能力

用：

```plaintext
/v1/messages
```

不要强行把 Claude 当成 OpenAI Chat Completions。

### 4. 接 Gemini

用：

```plaintext
/v1/models/{model}:generateContent
```

或者根据需要使用：

```plaintext
/v1beta/models/{model}:generateContent
```

稳定项目优先 `v1`，实验功能再考虑 `v1beta`。

### 5. 做 RAG / 向量搜索

需要组合：

```plaintext
/v1/embeddings
+
/v1/chat/completions 或 /v1/responses 或 /v1/messages
```

Embedding 负责检索，聊天接口负责生成答案。

### 6. 接第三方聚合服务

先确认它兼容哪种协议：

```plaintext
OpenAI-compatible
Anthropic-compatible
Gemini-compatible
```

然后再选择对应 SDK 和路径。

---

## 具体官方资源链接整理

### OpenAI

OpenAI Responses API：

      ![](https://cdn3.ldstatic.com/original/4X/d/9/e/d9e01e46a6d9bad6ebf65740192e9fa624cf66f6.svg)
    
      [OpenAI API Reference](https://developers.openai.com/api/reference/resources/responses)

### Responses

OpenAI Chat Completions API：

      ![](https://cdn3.ldstatic.com/original/4X/d/9/e/d9e01e46a6d9bad6ebf65740192e9fa624cf66f6.svg)
    
      [OpenAI API Reference](https://developers.openai.com/api/reference/resources/chat)

### Chat

OpenAI Chat Completions / Responses 迁移指南：

      ![](https://cdn3.ldstatic.com/original/4X/4/e/6/4e6c215b527d954515a2695f3754a6bce3aa56f7.png)
    
      [developers.openai.com](https://developers.openai.com/api/docs/guides/migrate-to-responses)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/0/7/b/07bb0ef53734084977d79628e2f4ec88cf92ec24_2_690x362.jpeg)

### Migrate to the Responses API | OpenAI API

OpenAI Embeddings Guide：

      ![](https://cdn3.ldstatic.com/original/4X/4/e/6/4e6c215b527d954515a2695f3754a6bce3aa56f7.png)
    
      [developers.openai.com](https://developers.openai.com/api/docs/guides/embeddings)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/6/5/1/651f50e259a3779dd9e79d5d173b1b454559b699_2_690x362.jpeg)

### Vector embeddings | OpenAI API

  Learn how to turn text into numbers, unlocking use cases like search, clustering, and more with OpenAI API embeddings.

OpenAI Embeddings API：

      ![](https://cdn3.ldstatic.com/original/4X/d/9/e/d9e01e46a6d9bad6ebf65740192e9fa624cf66f6.svg)
    
      [OpenAI API Reference](https://developers.openai.com/api/reference/resources/embeddings)

### Embeddings

OpenAI Models API：

      ![](https://cdn3.ldstatic.com/original/4X/d/9/e/d9e01e46a6d9bad6ebf65740192e9fa624cf66f6.svg)
    
      [OpenAI API Reference](https://developers.openai.com/api/reference/resources/models)

### Models

### Anthropic Claude

Anthropic Messages API：

      ![](https://cdn3.ldstatic.com/original/4X/5/4/8/5484c4122088856dcd2b9ca61a1893f4cda6e68f.png)
    
      [Claude API Reference](https://platform.claude.com/docs/en/api/messages)
    
    ![](https://cdn3.ldstatic.com/original/4X/2/9/9/2991017c3726b1a1069d26da6bee522b393aa662.png)

### Messages - Claude API Reference

  API reference for Messages endpoints

Anthropic Messages 使用指南：

      ![](https://cdn3.ldstatic.com/original/4X/5/4/8/5484c4122088856dcd2b9ca61a1893f4cda6e68f.png)
    
      [Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/working-with-messages)
    
    ![](https://cdn3.ldstatic.com/original/4X/8/9/e/89e4e334a1c7c221e96bb075dcf29613cff9c228.png)

### Using the Messages API

  Practical patterns and examples for using the Messages API effectively

Anthropic Streaming Messages：

      ![](https://cdn3.ldstatic.com/original/4X/5/4/8/5484c4122088856dcd2b9ca61a1893f4cda6e68f.png)
    
      [Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/streaming)
    
    ![](https://cdn3.ldstatic.com/original/4X/c/0/d/c0d95b4d23166336c21394620c42d5ecc2a29a8d.png)

### Streaming messages

  Claude API Documentation

### Google Gemini

Gemini API 版本说明：

      ![](https://cdn3.ldstatic.com/original/3X/b/2/b2a2be7cc9c7442d916d15b4c40049e353cd51bf.png)
    
      [Google AI for Developers](https://ai.google.dev/gemini-api/docs/api-versions?hl=zh-cn)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/b/d/b/bdbce41a52214eeb554a6c7c59f1d7b1bf35cdac_2_690x388.jpeg)

### API 版本说明 | Gemini API | Google AI for Developers

Gemini Generate Content API：

      ![](https://cdn3.ldstatic.com/original/3X/b/2/b2a2be7cc9c7442d916d15b4c40049e353cd51bf.png)
    
      [Google AI for Developers](https://ai.google.dev/api/generate-content?hl=zh-cn)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/b/d/b/bdbce41a52214eeb554a6c7c59f1d7b1bf35cdac_2_690x388.jpeg)

### Generating content | Gemini API | Google AI for Developers

Gemini API 文档首页：

      ![](https://cdn3.ldstatic.com/original/3X/b/2/b2a2be7cc9c7442d916d15b4c40049e353cd51bf.png)
    
      [Google AI for Developers](https://ai.google.dev/gemini-api/docs?hl=zh-cn)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/b/d/b/bdbce41a52214eeb554a6c7c59f1d7b1bf35cdac_2_690x388.jpeg)

### Gemini API | Google AI for Developers

  Gemini API 文档和 API 参考文档

### Mistral

Mistral API Reference：

      ![](https://cdn3.ldstatic.com/original/4X/2/2/6/226eed08bf498708d99209d02421ed3db0ccdb59.png)
    
      [docs.mistral.ai](https://docs.mistral.ai/api)

### Chat

  Welcome to Mistral AI's Api Reference

Mistral Chat / OpenAI 迁移相关文档：

      ![](https://cdn3.ldstatic.com/original/4X/2/2/6/226eed08bf498708d99209d02421ed3db0ccdb59.png)
    
      [docs.mistral.ai](https://docs.mistral.ai/resources/migration-guides)
    
    ![](https://cdn3.ldstatic.com/original/4X/b/1/b/b1bcacba57d667d4d9adc63a858412b92b2433e1.png)

### Migration guides | Mistral Docs

  Migrate to Mistral from OpenAI or self-hosted Llama with minimal code changes.

### xAI

xAI Chat Completions：

      ![](https://cdn3.ldstatic.com/original/4X/b/d/c/bdce82a21992bb5f91771dca1e6f3f595bac1c6f.png)
    
      [docs.x.ai](https://docs.x.ai/developers/rest-api-reference/inference/chat)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/4/3/0/43016680da9bec2e6ed7e4a9156f1ea205d501af_2_690x362.jpeg)

### Chat | Inference API - REST API Reference | xAI Docs

  Chat and Responses API endpoints

xAI API 文档首页：

      ![](https://cdn3.ldstatic.com/original/4X/b/d/c/bdce82a21992bb5f91771dca1e6f3f595bac1c6f.png)
    
      [docs.x.ai](https://docs.x.ai/overview)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/b/9/c/b9cf6644da8fead7b5f23c650008ff60c31da5a0_2_690x362.jpeg)

### Overview | xAI Docs

  Learn how to use our products and services

### DeepSeek

DeepSeek Chat Completion：

      ![](https://cdn3.ldstatic.com/original/4X/c/5/c/c5c46fad3cc452b7763024f8d06b3f60e8a6ae24.svg)
    
      [api-docs.deepseek.com](https://api-docs.deepseek.com/api/create-chat-completion/)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/6/1/a/61a41a97b108dde0cc6515f32fb59f75b7a86dd2_2_690x366.jpeg)

### Create Chat Completion | DeepSeek API Docs

  Creates a model response for the given chat conversation.

DeepSeek API 文档首页：

      ![](https://cdn3.ldstatic.com/original/4X/c/5/c/c5c46fad3cc452b7763024f8d06b3f60e8a6ae24.svg)
    
      [api-docs.deepseek.com](https://api-docs.deepseek.com/)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/6/1/a/61a41a97b108dde0cc6515f32fb59f75b7a86dd2_2_690x366.jpeg)

### Your First API Call | DeepSeek API Docs

  The DeepSeek API uses an API format compatible with OpenAI/Anthropic. By modifying the configuration, you can use the OpenAI/Anthropic SDK or softwares compatible with the OpenAI/Anthropic API to access the DeepSeek API.

### Groq

Groq OpenAI Compatibility：

      ![](https://cdn3.ldstatic.com/original/4X/a/a/b/aabf6a606f27ad3ceca8690d78680c02a7436627.png)
    
      [GroqDocs](https://console.groq.com/docs/openai)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/2/5/9/2599196da5db9007204b96a4ec2046b95ca33078_2_690x362.jpeg)

### OpenAI Compatibility - GroqDocs

  Learn how to use OpenAI's client libraries with Groq API, including configuration, supported features, and limitations.

Groq API 文档：

      ![](https://cdn3.ldstatic.com/original/4X/a/a/b/aabf6a606f27ad3ceca8690d78680c02a7436627.png)
    
      [GroqDocs](https://console.groq.com/docs/overview)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/2/5/9/2599196da5db9007204b96a4ec2046b95ca33078_2_690x362.jpeg)

### Overview - GroqDocs

  Fast LLM inference, OpenAI-compatible. Simple to integrate, easy to scale. Start building in minutes.

### OpenRouter

OpenRouter Chat Completion API：

      ![](https://cdn3.ldstatic.com/original/4X/0/0/0/0008d2ee847563810c50b212df53996525b29033.png)
    
      [openrouter.ai](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)

### Create a chat completion | OpenRouter | Documentation

  Sends a request for a model response for the given chat conversation. Supports both streaming and non-streaming modes.

OpenRouter API 文档首页：

      ![](https://cdn3.ldstatic.com/original/4X/0/0/0/0008d2ee847563810c50b212df53996525b29033.png)
    
      [OpenRouter Documentation](https://openrouter.ai/docs/quickstart)
    
    ![](https://cdn3.ldstatic.com/optimized/4X/5/d/6/5d654ca22b2bc00c3eda309468bdfd29585136ab_2_690x362.png)

### OpenRouter Quickstart Guide

  Get started with OpenRouter's unified API for hundreds of AI models. Learn how to integrate using the API directly, the Client SDKs, or the Agent SDK.

