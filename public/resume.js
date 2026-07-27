// SPDX-License-Identifier: MIT
// Copyright (c) 2026 LAI ZEYU

const resumeOrderForm = document.querySelector("#resumeOrderForm");
const resumeResult = document.querySelector("#resumeResult");
const resumeSubmitButton = document.querySelector("#resumeSubmitButton");
const resumeSubmittedAt = document.querySelector("#resumeSubmittedAt");
const resumeLangButtons = document.querySelectorAll("[data-resume-lang]");
const resumeLookupForm = document.querySelector("#resumeLookupForm");
const resumeLookupId = document.querySelector("#resumeLookupId");
const resumeLookupButton = document.querySelector("#resumeLookupButton");

const resumeTranslations = {
  zh: {
    "nav.resume": "简历项目",
    "nav.outputs": "双版本",
    "nav.payment": "付款",
    "nav.submit": "提交",
    "nav.result": "成果",
    "nav.workflow": "技术流程",
    "nav.cta": "开始生成",
    "hero.title": "RM79 生成两份实战简历 PDF",
    "hero.body": "把你的经历、教育、项目、技能和零散草稿直接粘贴进来。付款核验通过后，系统自动进入生成队列，输出一份图片结构版和一份 ATS 投递版。",
    "hero.primary": "提交资料",
    "hero.secondary": "查看交付物",
    "position.title": "我们的定位",
    "position.body": "以事实一致性、岗位相关性和 ATS 可读性为核心。每份简历先整理原始资料，再经过自动质量复审与双 PDF 文件验收；不会凭空编造学历、公司、奖项或数字。",
    "owner.title": "项目产权",
    "owner.body": "Lrobotform Resume 由 LAI ZEYU 创建。Copyright © 2026 LAI ZEYU，软件以 MIT License 发布。",
    "outputs.title": "一次付款，两份 PDF",
    "outputs.body": "同一份资料会生成两个用途不同的版本。图片版适合人工阅读和展示，ATS 版适合投递系统读取。",
    "outputs.visualKicker": "Version 01",
    "outputs.visualTitle": "图片结构版 PDF",
    "outputs.visualPrice": "按参考图逻辑排版",
    "outputs.visualBody": "教育、经历、项目、课外、技能、语言等模块清晰分区，适合发给老师、朋友或人工面试官阅读。",
    "outputs.atsKicker": "Version 02",
    "outputs.atsTitle": "ATS 投递版 PDF",
    "outputs.atsPrice": "单栏可复制文字",
    "outputs.atsBody": "不使用头像、图标、复杂表格和装饰元素，优先保证招聘系统能读取标题、日期、经历和关键词。",
    "payment.title": "安全订单流程",
    "payment.body": "生产环境使用私有配置处理付款核验。公开仓库不包含收款账号、二维码、客户付款凭证或任何 API 密钥。",
    "payment.securityKicker": "Private configuration",
    "payment.securityTitle": "凭证不会公开",
    "payment.bankNote": "付款文件保存在私有对象存储中，并通过 SHA-256 防止同一凭证重复使用。",
    "payment.caption": "私有存储与重复凭证拦截",
    "payment.security": "金额识别、风险判断和人工复核入口均在服务端完成；浏览器不会接触模型或存储密钥。",
    "order.title": "提交简历资料",
    "order.body": "不用按模版顺序整理。把你现有的简历、经历、课程项目、奖项、技能、目标岗位要求全部贴进来即可。",
    "output.title": "输出结果与下载",
    "output.body": "提交后，订单状态和两份 PDF 下载按钮会出现在这里。之后也可以输入订单访问码重新查询。",
    "output.emptyTitle": "成果会显示在这里",
    "output.emptyBody": "付款通过并生成完成后，这里会出现 ATS 投递版 PDF 和图片结构版 PDF 的下载按钮。",
    "field.contact": "联系方式 WX or WhatsApp *",
    "field.targetRole": "目标岗位 / 申请方向 *",
    "field.targetCountry": "目标国家 / 城市",
    "field.outputLanguage": "输出语言 *",
    "field.resumeText": "简历资料大杂烩 *",
    "field.notes": "额外要求",
    "field.proof": "付款截图或 PDF *",
    "field.contentAck": "我确认提供的信息真实准确；系统可以优化表达，但不会凭空编造学历、公司、奖项或经历。",
    "field.paymentAck": "我理解本服务交付两份简历 PDF，不承诺获得面试或录取结果。",
    "field.orderId": "订单访问码",
    "option.outputEn": "英文简历",
    "option.outputZh": "中文简历",
    "placeholder.targetRole": "例如 Data Analyst Intern / Finance Graduate Trainee",
    "placeholder.targetCountry": "例如 Malaysia / Singapore / China",
    "placeholder.resumeText": "可以直接粘贴：旧简历、教育经历、课程项目、实习、兼职、社团、技能、证书、目标 JD、想重点强调的经历...",
    "placeholder.notes": "例如：希望偏向数据分析、不要夸张、某段经历不想放进简历、内容需要更像实习投递等",
    "placeholder.orderId": "粘贴提交后获得的订单访问码",
    "price.kicker": "Fixed package",
    "price.body": "图片结构版 PDF + ATS 投递版 PDF",
    "button.submit": "提交并开始审核付款",
    "button.submitting": "正在提交...",
    "button.lookup": "查询结果",
    "button.checking": "正在查询...",
    "footer.back": "回到提交区",
    "footer.owner": "Copyright © 2026 LAI ZEYU · MIT License",
    "download.ats": "下载 ATS 投递版 PDF",
    "download.visual": "下载图片结构版 PDF",
    "result.ready": "简历已生成",
    "result.pending": "订单已提交，正在处理",
    "result.failed": "生成失败，等待人工处理",
    "result.cancelled": "订单已取消或付款未通过",
    "result.noDownloads": "目前没有可下载成果。如需继续处理，请联系管理员或重新提交正确付款凭证。",
    "result.statusError": "状态读取失败",
    "result.lookupMissing": "请先输入 Order ID。",
    "result.submitTitle": "简历订单已提交",
    "result.submitFailed": "提交失败",
    "result.paymentOk": "付款凭证审核成功",
    "result.paymentReview": "付款凭证等待老板人工核验",
    "result.output": "图片结构版 PDF + ATS 投递版 PDF",
    "trust.facts": "事实一致性核对",
    "trust.factsBody": "不凭空增加学校、公司、日期或数字",
    "trust.ats": "ATS 结构检查",
    "trust.atsBody": "单栏、可选择文字、标准章节标题",
    "trust.review": "自动质量复审",
    "trust.reviewBody": "低于质量门槛会自动修订后再检查",
    "trust.pdf": "双 PDF 验收",
    "trust.pdfBody": "两份文件完整生成后才显示为完成",
    "result.readySummary": "两份 PDF 已准备好。",
    "result.manual": "后台会保留订单资料。",
    "result.nextVerified": "付款已通过，等待简历生成。",
    "result.nextReview": "付款截图正在等待老板人工审核。刷新页面不会自动通过；老板确认付款后才会进入简历生成队列。",
    "label.orderId": "订单访问码",
    "label.payment": "Payment",
    "label.status": "Status",
    "label.summary": "Summary",
    "label.message": "Message",
    "label.next": "Next",
    "label.price": "Price",
    "label.output": "Output",
    "label.outputLanguage": "输出语言",
    "label.quality": "质量检查",
    "output.en": "英文简历",
    "output.zh": "中文简历",
  },
  en: {
    "nav.resume": "Resume",
    "nav.outputs": "Two PDFs",
    "nav.payment": "Payment",
    "nav.submit": "Submit",
    "nav.result": "Result",
    "nav.workflow": "Workflow",
    "nav.cta": "Start",
    "hero.title": "RM79 for two practical resume PDFs",
    "hero.body": "Paste your education, experience, projects, skills, and rough notes in any order. After payment verification, the system queues the job and creates one picture-style PDF plus one ATS-ready PDF.",
    "hero.primary": "Submit Details",
    "hero.secondary": "View Outputs",
    "position.title": "Positioning",
    "position.body": "Built around factual consistency, role relevance, and ATS readability. Every resume is structured from the original material, quality-reviewed, and validated as two complete PDFs without inventing education, employers, awards, or metrics.",
    "owner.title": "Project ownership",
    "owner.body": "Lrobotform Resume was created by LAI ZEYU. Copyright © 2026 LAI ZEYU. Software released under the MIT License.",
    "outputs.title": "One payment, two PDFs",
    "outputs.body": "The same information is turned into two practical versions: a picture-style version for human reading and an ATS version for application systems.",
    "outputs.visualKicker": "Version 01",
    "outputs.visualTitle": "Picture-style PDF",
    "outputs.visualPrice": "Reference-image structure",
    "outputs.visualBody": "Education, experience, projects, activities, skills, and languages are separated clearly for teachers, friends, or interviewers to read.",
    "outputs.atsKicker": "Version 02",
    "outputs.atsTitle": "ATS-ready PDF",
    "outputs.atsPrice": "Single-column selectable text",
    "outputs.atsBody": "No avatar, icons, complex tables, or decoration. The layout prioritizes readable titles, dates, experience, and keywords for recruiting systems.",
    "payment.title": "Secure order workflow",
    "payment.body": "Production payment verification uses private configuration. The public repository contains no bank details, payment QR codes, customer receipts, or API secrets.",
    "payment.securityKicker": "Private configuration",
    "payment.securityTitle": "Receipts stay private",
    "payment.bankNote": "Payment files are stored in private object storage and SHA-256 prevents the same proof from being reused.",
    "payment.caption": "Private storage and duplicate-proof blocking",
    "payment.security": "Amount extraction, risk checks, and manual review all run server-side. Model and storage credentials never reach the browser.",
    "order.title": "Submit Resume Details",
    "order.body": "No need to sort everything into a template. Paste your resume, experiences, coursework, awards, skills, and target job details directly.",
    "output.title": "Output and Downloads",
    "output.body": "After submission, order status and the two PDF download buttons appear here. You can use the private order access code to check again later.",
    "output.emptyTitle": "Your output will appear here",
    "output.emptyBody": "After payment is approved and generation is complete, the ATS-ready PDF and picture-style PDF download buttons will appear here.",
    "field.contact": "Contact WX or WhatsApp *",
    "field.targetRole": "Target role / application direction *",
    "field.targetCountry": "Target country / city",
    "field.outputLanguage": "Output language *",
    "field.resumeText": "Resume information dump *",
    "field.notes": "Extra requirements",
    "field.proof": "Payment screenshot or PDF *",
    "field.contentAck": "I confirm the information is accurate. The system may improve wording, but it will not invent education, companies, awards, or experience.",
    "field.paymentAck": "I understand this service delivers two resume PDFs and does not guarantee interviews or offers.",
    "field.orderId": "Order access code",
    "option.outputEn": "English resume",
    "option.outputZh": "Chinese resume",
    "placeholder.targetRole": "e.g. Data Analyst Intern / Finance Graduate Trainee",
    "placeholder.targetCountry": "e.g. Malaysia / Singapore / China",
    "placeholder.resumeText": "Paste anything useful: old resume, education, coursework, internship, part-time work, activities, skills, certificates, target JD, experience to emphasize...",
    "placeholder.notes": "e.g. focus on data analysis, avoid exaggeration, exclude a certain experience, make it better for internship applications",
    "placeholder.orderId": "Paste the private access code returned after submission",
    "price.kicker": "Fixed package",
    "price.body": "Picture-style PDF + ATS-ready PDF",
    "button.submit": "Submit and verify payment",
    "button.submitting": "Submitting...",
    "button.lookup": "Check Result",
    "button.checking": "Checking...",
    "footer.back": "Back to form",
    "footer.owner": "Copyright © 2026 LAI ZEYU · MIT License",
    "download.ats": "Download ATS-ready PDF",
    "download.visual": "Download picture-style PDF",
    "result.ready": "Resume generated",
    "result.pending": "Order submitted, processing",
    "result.failed": "Generation failed, pending manual handling",
    "result.cancelled": "Order cancelled or payment not approved",
    "result.noDownloads": "There are no downloadable files for this order right now. Contact admin or resubmit the correct payment proof if needed.",
    "result.statusError": "Status check failed",
    "result.lookupMissing": "Please enter an Order ID first.",
    "result.submitTitle": "Resume order submitted",
    "result.submitFailed": "Submission failed",
    "result.paymentOk": "Payment proof verified",
    "result.paymentReview": "Payment proof pending admin review",
    "result.output": "Picture-style PDF + ATS-ready PDF",
    "trust.facts": "Factual consistency",
    "trust.factsBody": "No invented schools, companies, dates, or metrics",
    "trust.ats": "ATS structure check",
    "trust.atsBody": "Single column, selectable text, standard sections",
    "trust.review": "Automatic quality review",
    "trust.reviewBody": "Drafts below the quality gate are revised and checked again",
    "trust.pdf": "Two-PDF validation",
    "trust.pdfBody": "The job completes only after both files pass validation",
    "result.readySummary": "Both PDFs are ready.",
    "result.manual": "The admin backend has kept the order details.",
    "result.nextVerified": "Payment is verified. Waiting for resume generation.",
    "result.nextReview": "The payment screenshot is waiting for manual review. Refreshing will not approve it automatically; it enters the resume queue after admin approval.",
    "label.orderId": "Order access code",
    "label.payment": "Payment",
    "label.status": "Status",
    "label.summary": "Summary",
    "label.message": "Message",
    "label.next": "Next",
    "label.price": "Price",
    "label.output": "Output",
    "label.outputLanguage": "Output language",
    "label.quality": "Quality check",
    "output.en": "English resume",
    "output.zh": "Chinese resume",
  },
};

let statusTimer = null;
let resumeLanguage =
  localStorage.getItem("lrobotformResumeLanguage") || (navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en");

function tr(key) {
  return resumeTranslations[resumeLanguage][key] || resumeTranslations.zh[key] || key;
}

function applyResumeLanguage(language) {
  resumeLanguage = language;
  localStorage.setItem("lrobotformResumeLanguage", language);
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = language === "zh" ? "Lrobotform Resume | ATS 简历优化" : "Lrobotform Resume | ATS Optimization";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = tr(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = tr(node.dataset.i18nPlaceholder);
  });
  resumeLangButtons.forEach((button) => {
    const active = button.dataset.resumeLang === language;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function outputLanguageLabel(value) {
  return value === "zh" ? tr("output.zh") : tr("output.en");
}

function resetResumeSubmissionClock() {
  if (resumeSubmittedAt) resumeSubmittedAt.value = String(Date.now());
}

function showResumeResult(content, variant = "info", shouldScroll = true) {
  resumeResult.hidden = false;
  resumeResult.className = `result-box ${variant}`;
  if (content instanceof Node) {
    resumeResult.replaceChildren(content);
  } else {
    resumeResult.textContent = String(content || "");
  }
  if (shouldScroll) resumeResult.scrollIntoView({ behavior: "smooth", block: "center" });
}

function detailBlock(title, rows, actions = []) {
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("strong");
  heading.textContent = title;
  fragment.append(heading);

  const details = document.createElement("dl");
  rows.forEach(([term, value]) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = String(value ?? "--");
    row.append(dt, dd);
    details.append(row);
  });
  fragment.append(details);

  if (actions.length) {
    const actionRow = document.createElement("div");
    actionRow.className = "resume-status-actions";
    actions.forEach((action) => actionRow.append(action));
    fragment.append(actionRow);
  }
  return fragment;
}

function errorBlock(title, message) {
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("strong");
  heading.textContent = title;
  const body = document.createElement("p");
  body.textContent = message;
  fragment.append(heading, body);
  return fragment;
}

function downloadLink(href, label) {
  const link = document.createElement("a");
  link.className = "primary-link";
  link.href = href;
  link.textContent = label;
  return link;
}

function qualityLabel(result) {
  const quality = result?.quality;
  if (!quality || !Number.isFinite(Number(quality.score))) return "--";
  return `${Number(quality.score)}/${Number(quality.minimum || 82)} · ${quality.passed ? "PASS" : "REVIEW"}`;
}

async function pollResumeStatus(orderId, shouldScroll = true) {
  const response = await fetch(`/api/resume-status?id=${encodeURIComponent(orderId)}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || "无法读取生成状态。");

  if (result.jobStatus === "completed") {
    clearInterval(statusTimer);
    const actions = [];
    if (result.downloads?.ats) actions.push(downloadLink(result.downloads.ats, tr("download.ats")));
    if (result.downloads?.visual) actions.push(downloadLink(result.downloads.visual, tr("download.visual")));
    showResumeResult(
      detailBlock(
        tr("result.ready"),
        [
          [tr("label.orderId"), result.id],
          [tr("label.payment"), result.paymentStatus],
          [tr("label.status"), result.jobStatus],
          [tr("label.quality"), qualityLabel(result)],
          [tr("label.summary"), result.summary || tr("result.readySummary")],
        ],
        actions,
      ),
      "success",
      shouldScroll,
    );
    return;
  }

  if (result.jobStatus === "failed" || result.status === "failed") {
    clearInterval(statusTimer);
    showResumeResult(
      detailBlock(tr("result.failed"), [
        [tr("label.orderId"), result.id],
        [tr("label.payment"), result.paymentStatus],
        [tr("label.status"), result.jobStatus || result.status],
        [tr("label.quality"), qualityLabel(result)],
        [tr("label.message"), result.summary || tr("result.manual")],
      ]),
      "error",
      shouldScroll,
    );
    return;
  }

  if (result.jobStatus === "cancelled" || result.status === "cancelled" || result.paymentStatus === "rejected" || result.status === "payment_rejected") {
    clearInterval(statusTimer);
    showResumeResult(
      detailBlock(tr("result.cancelled"), [
        [tr("label.orderId"), result.id],
        [tr("label.payment"), result.paymentStatus],
        [tr("label.status"), result.jobStatus || result.status],
        [tr("label.message"), result.summary || tr("result.noDownloads")],
      ]),
      "error",
      shouldScroll,
    );
    return;
  }

  showResumeResult(
    detailBlock(tr("result.pending"), [
      [tr("label.orderId"), result.id],
      [tr("label.payment"), result.paymentStatus],
      [tr("label.status"), result.jobStatus || result.status],
      [tr("label.quality"), qualityLabel(result)],
      [tr("label.next"), result.paymentStatus === "verified" ? tr("result.nextVerified") : tr("result.nextReview")],
    ]),
    result.paymentStatus === "verified" ? "review" : "review",
    shouldScroll,
  );
}

function startStatusPolling(orderId, options = {}) {
  if (!orderId) return;
  const shouldScroll = options.scroll !== false;
  if (resumeLookupId) resumeLookupId.value = orderId;
  localStorage.setItem("lrobotformResumeOrderId", orderId);
  clearInterval(statusTimer);
  pollResumeStatus(orderId, shouldScroll).catch((error) => {
    showResumeResult(errorBlock(tr("result.statusError"), error.message), "error");
  });
  statusTimer = setInterval(() => {
    pollResumeStatus(orderId, false).catch(() => {});
  }, 8000);
}

async function submitResumeOrder(event) {
  event.preventDefault();
  const originalText = resumeSubmitButton.textContent;
  resumeSubmitButton.disabled = true;
  resumeSubmitButton.textContent = tr("button.submitting");

  try {
    const outputLanguageValue = resumeOrderForm.querySelector("#outputLanguage")?.value || "en";
    const formData = new FormData(resumeOrderForm);
    const response = await fetch("/api/resume-order", {
      method: "POST",
      body: formData,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `${response.status}`);

    const paymentPassed = result.paymentStatus === "verified";
    showResumeResult(
      detailBlock(tr("result.submitTitle"), [
        [tr("label.orderId"), result.id],
        [tr("label.price"), `${result.expected?.amount || 79} ${result.expected?.currency || "MYR"}`],
        [tr("label.payment"), paymentPassed ? tr("result.paymentOk") : tr("result.paymentReview")],
        [tr("label.outputLanguage"), outputLanguageLabel(outputLanguageValue)],
        [tr("label.output"), tr("result.output")],
      ]),
      paymentPassed ? "success" : "review",
    );
    resumeOrderForm.reset();
    resetResumeSubmissionClock();
    startStatusPolling(result.id, { scroll: true });
  } catch (error) {
    showResumeResult(errorBlock(tr("result.submitFailed"), String(error.message || error)), "error");
  } finally {
    resumeSubmitButton.disabled = false;
    resumeSubmitButton.textContent = originalText;
  }
}

async function lookupResumeOrder(event) {
  event.preventDefault();
  const orderId = String(resumeLookupId?.value || "").trim();
  if (!orderId) {
    showResumeResult(errorBlock(tr("result.statusError"), tr("result.lookupMissing")), "error");
    return;
  }
  const originalText = resumeLookupButton.textContent;
  resumeLookupButton.disabled = true;
  resumeLookupButton.textContent = tr("button.checking");
  try {
    startStatusPolling(orderId, { scroll: true });
  } finally {
    resumeLookupButton.disabled = false;
    resumeLookupButton.textContent = originalText;
  }
}

resumeOrderForm?.addEventListener("submit", submitResumeOrder);
resumeLookupForm?.addEventListener("submit", lookupResumeOrder);
resumeLangButtons.forEach((button) => button.addEventListener("click", () => applyResumeLanguage(button.dataset.resumeLang)));
applyResumeLanguage(resumeLanguage);
resetResumeSubmissionClock();

const savedOrderId = localStorage.getItem("lrobotformResumeOrderId");
if (savedOrderId) {
  startStatusPolling(savedOrderId, { scroll: false });
}
