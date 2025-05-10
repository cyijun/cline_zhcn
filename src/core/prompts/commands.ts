export const newTaskToolResponse = () =>
	`<explicit_instructions type="new_task">
用户已明确要求您帮助创建带有预加载上下文的新任务。用户可能提供了需要您在总结现有工作和创建新任务上下文时考虑的额外说明或信息。
无论是否提供额外信息，您必须仅通过调用 new_task 工具来响应此消息。

new_task 工具定义如下：

描述：
您的任务是创建当前对话的详细摘要，特别注意用户的明确请求和您之前的操作。摘要应完整记录对继续新任务至关重要的技术细节、代码模式和架构决策。
用户将看到生成的上下文预览，并选择创建新任务或继续当前对话。

参数：
- Context: (必填) 预加载到新任务的上下文，应包括：
  1. 当前工作：详细描述在创建新任务请求之前正在进行的工作，特别注意最近的对话记录
  2. 关键技术概念：列出所有可能与新任务相关的重要技术概念、技术栈、编码规范和框架
  3. 相关文件和代码：枚举检查、修改或创建的特定文件和代码段，特别注意最近的变更
  4. 问题解决：记录已解决的问题和当前故障排除进展
  5. 待办任务和后续步骤：列出所有明确要求的待处理任务及后续步骤，包含增加清晰度的代码片段，对于后续步骤需直接引用最近对话中的原文

Usage:
<new_task>
<context>context to preload new task with</context>
</new_task>

Below is the the user's input when they indicated that they wanted to create a new task.
</explicit_instructions>\n
`

export const condenseToolResponse = () =>
	`<explicit_instructions type="condense">
用户已明确要求创建当前对话的详细摘要，用于压缩上下文窗口同时保留关键信息。用户可能提供了摘要时需要特别注意的额外说明。
无论是否提供额外信息，必须仅通过调用 condense 工具响应此消息。

condense 工具定义如下：

描述：
您的任务是创建当前对话的详细摘要，特别注意用户的明确请求和之前的操作。摘要应完整记录对继续对话和支持后续任务至关重要的技术细节、代码模式和架构决策。
用户将看到生成的摘要预览，并选择用于压缩上下文窗口或继续当前对话。
用户可能使用'smol'或'compact'指代此工具，在类似上下文中应视为与'condense'等效。

参数：
- Context: (必填) 继续对话所需的上下文，包括：
  1. 先前对话：概括整个对话的关键内容，使他人能理解整体对话流程
  2. 当前工作：详细描述压缩上下文窗口请求之前的工作，特别注意最近的对话记录
  3. 关键技术概念：列出所有可能相关的重要技术概念、技术栈和框架
  4. 相关文件和代码：枚举检查、修改或创建的特定文件和代码段，特别注意最近的变更
  5. 问题解决：记录已解决的问题和当前故障排除进展
  6. 待办任务和后续步骤：列出所有明确要求的待处理任务及后续步骤，包含增加清晰度的代码片段，对于后续步骤需直接引用最近对话中的原文

Usage:
<condense>
<context>Your detailed summary</context>
</condense>

Example:
<condense>
<context>
1. Previous Conversation:
  [Detailed description]

2. Current Work:
  [Detailed description]

3. Key Technical Concepts:
  - [Concept 1]
  - [Concept 2]
  - [...]

4. Relevant Files and Code:
  - [File Name 1]
    - [Summary of why this file is important]
    - [Summary of the changes made to this file, if any]
    - [Important Code Snippet]
  - [File Name 2]
    - [Important Code Snippet]
  - [...]

5. Problem Solving:
  [Detailed description]

6. Pending Tasks and Next Steps:
  - [Task 1 details & next steps]
  - [Task 2 details & next steps]
  - [...]
</context>
</condense>

</explicit_instructions>\n
`

export const newRuleToolResponse = () =>
	`<explicit_instructions type="new_rule">
用户已明确要求基于当前对话创建.clinerules目录下的新规则文件。用户可能提供了创建规则时需要考虑的额外说明。
创建新规则文件时不应覆盖或修改现有文件，必须使用 new_rule 工具。该工具可在 PLAN 或 ACT 模式下使用。

new_rule 工具定义如下：

描述：
创建新的Cline规则文件，包含与用户协作开发的指导方针，可以是项目特定或全局规则。包括但不限于：
- 偏好的对话风格
- 常用项目依赖
- 编码风格
- 命名规范
- 架构选择
- UI/UX偏好

规则文件必须为Markdown格式(.md)，文件名应简洁概括规则主题（如'memory-bank.md'或'project-overview.md'）。

参数：
- Path: (必填) 文件写入路径（相对当前工作目录），必须位于.clinerules目录下（不存在时自动创建）。文件名不能是"default-clineignore.md"，使用连字符(-)分隔单词
- Content: (必填) 完整的文件内容，必须包含：
  1. 使用Markdown标题划分不同章节，从"## 概述"开始
  2. 每个章节使用项目符号详细说明，仅在必要时添加示例
  3. 规则可针对具体任务/项目或通用概念，包含：
     - 编码规范
     - 设计模式
     - 技术栈偏好
     - 与Cline的交互风格
     - 测试策略
     - 注释规范等
  4. 规则应基于实际对话内容，避免假设用户偏好
  5. 不应包含对话细节的简单复述

Usage:
<new_rule>
<path>.clinerules/{file name}.md</path>
<content>Cline rule file content here</content>
</new_rule>

Example:
<new_rule>
<path>.clinerules/project-preferences.md</path>
<content>
## Brief overview
  [Brief description of the rules, including if this set of guidelines is project-specific or global]

## Communication style
  - [Description, rule, preference, instruction]
  - [...]

## Development workflow
  - [Description, rule, preference, instruction]
  - [...]

## Coding best practices
  - [Description, rule, preference, instruction]
  - [...]

## Project context
  - [Description, rule, preference, instruction]
  - [...]

## Other guidelines
  - [Description, rule, preference, instruction]
  - [...]
</content>
</new_rule>

Below is the user's input when they indicated that they wanted to create a new Cline rule file.
</explicit_instructions>\n
`

export const reportBugToolResponse = () =>
	`<explicit_instructions type="report_bug">
用户已明确要求提交Bug到Cline的GitHub页面。必须立即协助完成此操作，无论之前的对话内容如何。需使用report_bug工具，但应先确认收集了所有必要信息。

使用要求：
1. 如果所需信息已在对话中出现，可建议填充相应字段
2. 无法明确问题时，应与用户交流直至收集完整信息
3. 询问时使用友好字段名称（如"重现步骤"而非"steps_to_reproduce"）
4. 该工具可在 PLAN 或 ACT 模式下使用

report_bug 工具定义如下：

描述：
填写GitHub问题报告的所有必填字段。应尽量获取详细的Bug描述，当用户不清楚某些细节时可将字段设为"N/A"。

参数：
- title: (必填) 问题简述
- what_happened: (必填) 实际现象与预期结果
- steps_to_reproduce: (必填) 重现步骤
- api_request_output: (可选) 相关API请求输出
- additional_context: (可选) 其他未提及的上下文

Usage:
<report_bug>
<title>Title of the issue</title>
<what_happened>Description of the issue</what_happened>
<steps_to_reproduce>Steps to reproduce the issue</steps_to_reproduce>
<api_request_output>Output from the LLM API related to the bug</api_request_output>
<additional_context>Other issue details not already covered</additional_context>
</report_bug>

Below is the user's input when they indicated that they wanted to submit a Github issue.
</explicit_instructions>\n
`
