import { Anthropic } from "@anthropic-ai/sdk"
import * as diff from "diff"
import * as path from "path"
import { ClineIgnoreController, LOCK_TEXT_SYMBOL } from "../ignore/ClineIgnoreController"

export const formatResponse = {
	duplicateFileReadNotice: () =>
		`[[提示] 为节省上下文窗口空间，此文件读取已被移除。请参考最新的文件读取操作获取该文件的最新版本。]`,

	contextTruncationNotice: () =>
		`[提示] 部分早期对话历史已被删除以保持最佳上下文窗口长度。初始用户任务和最近的对话交换已保留以确保连贯性，中间对话历史已被删除。请在继续协助时注意此情况。`,

	condense: () =>
		`用户已接受您生成的对话摘要。此摘要涵盖了被截断的历史对话重要细节。\n<explicit_instructions type="condense_response">您必须仅通过询问用户下一步工作内容进行响应。不应主动采取行动或做出任何假设。例如不应建议文件修改或尝试读取任何文件。\n提问时可参考摘要中已生成的信息，但必须仅基于摘要内容。请保持回答简洁。</explicit_instructions>`,

	toolDenied: () => `用户拒绝了此操作。`,

	toolError: (error?: string) => `工具执行失败，错误信息如下：\n<error>\n${error}\n</error>`,

	clineIgnoreError: (path: string) =>
		`访问 ${path} 被 .clineignore 文件设置阻止。必须在不使用此文件的情况下继续任务，或请求用户更新 .clineignore 文件。`,

	noToolsUsed: () =>
		`[错误] 您在前一个响应中未使用工具！请用工具操作重试。

${toolUseInstructionsReminder}

# 下一步

若已完成用户任务，请使用 attempt_completion 工具。 
若需要用户补充信息，请使用 ask_followup_question 工具。 
若未完成且无需补充信息，请继续任务下一步。 
（此为自动消息，无需对话式回复。）`,

	tooManyMistakes: (feedback?: string) =>
		`您似乎遇到困难。用户提供以下反馈供参考：\n<feedback>\n${feedback}\n</feedback>`,

	missingToolParameterError: (paramName: string) =>
		`缺少必填参数 '${paramName}' 的值。请用完整响应重试。\n\n${toolUseInstructionsReminder}`,

	invalidMcpToolArgumentError: (serverName: string, toolName: string) =>
		`与 ${toolName} 一同使用的 ${serverName} JSON 参数无效。请用正确格式的 JSON 参数重试。`,

	toolResult: (text: string, images?: string[]): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> => {
		if (images && images.length > 0) {
			const textBlock: Anthropic.TextBlockParam = { type: "text", text }
			const imageBlocks: Anthropic.ImageBlockParam[] = formatImagesIntoBlocks(images)
			// 将图像置于文本后方可获得更佳结果
			return [textBlock, ...imageBlocks]
		} else {
			return text
		}
	},

	imageBlocks: (images?: string[]): Anthropic.ImageBlockParam[] => {
		return formatImagesIntoBlocks(images)
	},

	formatFilesList: (
		absolutePath: string,
		files: string[],
		didHitLimit: boolean,
		clineIgnoreController?: ClineIgnoreController,
	): string => {
		const sorted = files
			.map((file) => {
				// 将绝对路径转换为相对路径
				const relativePath = path.relative(absolutePath, file).toPosix()
				return file.endsWith("/") ? relativePath + "/" : relativePath
			})
			// 排序以显示文件在各自目录下的从属关系
			.sort((a, b) => {
				const aParts = a.split("/") // 仅适用于 toPosix() 转换
				const bParts = b.split("/")
				for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
					if (aParts[i] !== bParts[i]) {
						// 若某级为目录而另一级不是，则目录排前
						if (i + 1 === aParts.length && i + 1 < bParts.length) {
							return -1
						}
						if (i + 1 === bParts.length && i + 1 < aParts.length) {
							return 1
						}
						// 否则按字母顺序排序
						return aParts[i].localeCompare(bParts[i], undefined, {
							numeric: true,
							sensitivity: "base",
						})
					}
				}
				// 若所有路径部分都在较短路径长度内相同，则较短路径排前
				return aParts.length - bParts.length
			})

		const clineIgnoreParsed = clineIgnoreController
			? sorted.map((filePath) => {
					// 路径为相对于绝对路径的相对路径，而非当前工作目录
					// validateAccess 期望工作目录相对路径或绝对路径
					// 否则对于诸如 "assets/icons" 的忽略模式，最终会得到仅 "icons" 的结果，导致路径未被忽略
					const absoluteFilePath = path.resolve(absolutePath, filePath)
					const isIgnored = !clineIgnoreController.validateAccess(absoluteFilePath)
					if (isIgnored) {
						return LOCK_TEXT_SYMBOL + " " + filePath
					}

					return filePath
				})
			: sorted

		if (didHitLimit) {
			return `${clineIgnoreParsed.join(
				"\n",
			)}\n\n(文件列表已截断。若需进一步探索，请在特定子目录使用 list_files 工具。)`
		} else if (clineIgnoreParsed.length === 0 || (clineIgnoreParsed.length === 1 && clineIgnoreParsed[0] === "")) {
			return "未找到文件。"
		} else {
			return clineIgnoreParsed.join("\n")
		}
	},

	createPrettyPatch: (filename = "file", oldStr?: string, newStr?: string) => {
		// 字符串不可为 undefined，否则 diff 会抛出异常
		const patch = diff.createPatch(filename.toPosix(), oldStr || "", newStr || "")
		const lines = patch.split("\n")
		const prettyPatchLines = lines.slice(4)
		return prettyPatchLines.join("\n")
	},

	taskResumption: (
		mode: "plan" | "act",
		agoText: string,
		cwd: string,
		wasRecent: boolean | 0 | undefined,
		responseText?: string,
	): [string, string] => {
		const taskResumptionMessage = `[任务恢复] ${
			mode === "plan"
				? `此任务在 ${agoText} 被中断。对话可能不完整。请注意此时项目状态可能已改变。当前工作目录为 '${cwd.toPosix()}'。\n\n注意：若您之前尝试过用户未提供结果的工具操作，应视为操作未成功。但您处于计划模式，因此不应继续任务，而应响应用户的当前消息。`
				: `此任务在 ${agoText} 被中断。可能已完成或未完成，请重新评估任务上下文。请注意此时项目状态可能已改变。当前工作目录为 '${cwd.toPosix()}'。若任务未完成，请重试中断前的最后一步操作并继续完成任务。\n\n注意：若您之前尝试过用户未提供结果的工具操作，应视为操作未成功并评估是否重试。若最后工具为 browser_action，浏览器已关闭，必须重新启动浏览器。`
		}${
			wasRecent
				? "\n\n重要：若最后工具为 replace_in_file 或 write_to_file 且被中断，则文件已回滚到编辑前状态，无需重新读取文件，您已拥有最新内容。"
				: ""
		}`

		const userResponseMessage = `${
			responseText
				? `${mode === "plan" ? "用 plan_mode_respond 工具响应的新消息 (请确保在 <response> 参数中提供响应)" : "任务继续的新指令"}:\n<user_message>\n${responseText}\n</user_message>`
				: mode === "plan"
					? "(用户未提供新消息。可考虑询问其希望如何继续，或建议切换到执行模式继续任务。)"
					: ""
		}`

		return [taskResumptionMessage, userResponseMessage]
	},

	planModeInstructions: () => {
		return `在此模式下应专注于信息收集、提问和架构解决方案。获取所有必要信息后使用 plan_mode_respond 工具与用户进行对话交流。在通过 read_file 或 ask_followup_question 获得足够信息前，不要使用 plan_mode_respond 工具。
(注意：若用户似乎需要使用仅执行模式可用的工具，应提示用户"切换到执行模式"(使用此确切措辞) - 用户需手动操作完成模式切换。您无法自行切换到执行模式，必须等待用户满意计划后手动切换。)`
	},

	fileEditWithUserChanges: (
		relPath: string,
		userEdits: string,
		autoFormattingEdits: string | undefined,
		finalContent: string | undefined,
		newProblemsMessage: string | undefined,
	) =>
		`用户对您的内容进行了以下更新：\n\n${userEdits}\n\n` +
		(autoFormattingEdits
			? `此外，用户的编辑器对内容应用了以下自动格式化：\n\n${autoFormattingEdits}\n\n(注意：请特别关注单引号转双引号、分号增删、长行拆分、缩进风格调整、尾随逗号增删等变化。这将帮助您确保未来对该文件的 SEARCH/REPLACE 操作准确。)\n\n`
			: "") +
		`包含您的原始修改和额外编辑的更新内容已成功保存至 ${relPath.toPosix()}。以下是该文件的完整更新内容：\n\n` +
		`<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
		`请注意：\n` +
		`1. 无需用这些更改重写文件，因为它们已应用。\n` +
		`2. 请以更新后的文件内容作为新基准继续任务。\n` +
		`3. 若用户的编辑已解决部分任务或更改需求，请相应调整您的方法。\n` +
		`4. 重要：对此文件进行未来修改时，请以以上 final_file_content 为准。此内容反映了文件当前状态，包括用户编辑和任何自动格式化(如您用单引号但格式化为双引号)。所有 SEARCH/REPLACE 操作必须基于此最终版本以确保准确性。\n` +
		`${newProblemsMessage}`,

	fileEditWithoutUserChanges: (
		relPath: string,
		autoFormattingEdits: string | undefined,
		finalContent: string | undefined,
		newProblemsMessage: string | undefined,
	) =>
		`内容已成功保存至 ${relPath.toPosix()}。\n\n` +
		(autoFormattingEdits
			? `除您的编辑外，用户的编辑器应用了以下自动格式化：\n\n${autoFormattingEdits}\n\n(注意：请特别关注单引号转双引号、分号增删、长行拆分、缩进风格调整、尾随逗号增删等变化。这将帮助您确保未来对此文件的 SEARCH/REPLACE 操作准确。)\n\n`
			: "") +
		`以下是保存后的文件完整更新内容：\n\n` +
		`<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
		`重要：对此文件进行未来修改时，请以以上 final_file_content 为准。此内容反映了文件当前状态，包括任何自动格式化(如您用单引号但格式化为双引号)。所有 SEARCH/REPLACE 操作必须基于此最终版本以确保准确性。\n\n` +
		`${newProblemsMessage}`,

	diffError: (relPath: string, originalContent: string | undefined) =>
		`这可能是因为 SEARCH 块内容与文件实际内容不完全匹配，或者多个 SEARCH/REPLACE 块在文件中出现顺序不正确。\n\n` +
		`文件已回滚到原始状态：\n\n` +
		`<file_content path="${relPath.toPosix()}">\n${originalContent}\n</file_content>\n\n` +
		`现在您已拥有文件最新状态，重新尝试操作时请使用更少更精确的 SEARCH 块。对于大文件，建议每次操作限制在 <5 个 SEARCH/REPLACE 块以内，等待用户响应操作结果后再继续后续修改。\n(若连续三次出现此错误，可作为后备方案使用 write_to_file 工具。)`,

	toolAlreadyUsed: (toolName: string) =>
		`未执行工具 [${toolName}]，因为本消息中已使用过工具。每条消息只能使用一个工具，必须评估第一个工具的结果后再继续使用下一个工具。`,

	clineIgnoreInstructions: (content: string) =>
		`# .clineignore\n\n(以下由根级 .clineignore 文件提供，其中用户指定不应访问的文件和目录。当使用 list_files 时，被阻止的文件会显示 ${LOCK_TEXT_SYMBOL} 标记。尝试通过 read_file 获取这些文件内容会返回错误。)\n\n${content}\n.clineignore`,

	clineRulesGlobalDirectoryInstructions: (globalClineRulesFilePath: string, content: string) =>
		`# .clinerules/\n\n全局 .clinerules/ 目录由 ${globalClineRulesFilePath.toPosix()} 提供，其中包含所有工作目录的指令：\n\n${content}`,

	clineRulesLocalDirectoryInstructions: (cwd: string, content: string) =>
		`# .clinerules\n\n以下由根级 .clinerules/ 目录提供，包含当前工作目录 (${cwd.toPosix()}) 的指令\n\n${content}`,

	clineRulesLocalFileInstructions: (cwd: string, content: string) =>
		`# .clinerules\n\n以下由根级 .clinerules 文件提供，包含当前工作目录 (${cwd.toPosix()}) 的指令\n\n${content}`,

	windsurfRulesLocalFileInstructions: (cwd: string, content: string) =>
		`# .windsurfrules\n\n以下由根级 .windsurfrules 文件提供，包含当前工作目录 (${cwd.toPosix()}) 的指令\n\n${content}`,

	cursorRulesLocalFileInstructions: (cwd: string, content: string) =>
		`# .cursorrules\n\n以下由根级 .cursorrules 文件提供，包含当前工作目录 (${cwd.toPosix()}) 的指令\n\n${content}`,

	cursorRulesLocalDirectoryInstructions: (cwd: string, content: string) =>
		`# .cursor/rules\n\n以下由根级 .cursor/rules 目录提供，包含当前工作目录 (${cwd.toPosix()}) 的指令\n\n${content}`,
}

// 避免循环依赖
const formatImagesIntoBlocks = (images?: string[]): Anthropic.ImageBlockParam[] => {
	return images
		? images.map((dataUrl) => {
				// data:image/png;base64,base64string
				const [rest, base64] = dataUrl.split(",")
				const mimeType = rest.split(":")[1].split(";")[0]
				return {
					type: "image",
					source: {
						type: "base64",
						media_type: mimeType,
						data: base64,
					},
				} as Anthropic.ImageBlockParam
			})
		: []
}

const toolUseInstructionsReminder = `# 提示：工具使用说明

工具使用采用XML风格标签格式。工具名需用开闭标签包裹，每个参数也需用对应开闭标签包裹。结构如下：

<tool_name>
<parameter1_name>值1</parameter1_name>
<parameter2_name>值2</parameter2_name>
...
</tool_name>

示例：

<attempt_completion>
<result>
任务已完成...
</result>
</attempt_completion>

所有工具使用必须遵循此格式以确保正确解析和执行。`
