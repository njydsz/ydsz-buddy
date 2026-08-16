//! # HTML 原型生成模块
//!
//! 本模块提供快速生成可预览 HTML 原型页面的能力：
//!
//! - **模板生成**：支持 landing page、dashboard、form 等基础模板
//! - **Tailwind CSS**：通过 CDN 引入，无需本地依赖
//! - **自包含输出**：生成单个 HTML 文件，可直接在浏览器中打开

use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;

/// 支持的模板类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Template {
    /// 落地页（Hero + Features + Footer）
    LandingPage,
    /// 仪表盘（侧边栏 + 顶栏 + 内容区）
    Dashboard,
    /// 表单页（标题 + 表单 + 提交按钮）
    Form,
}

impl FromStr for Template {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "landing" | "landing_page" | "landingpage" => Ok(Self::LandingPage),
            "dashboard" => Ok(Self::Dashboard),
            "form" => Ok(Self::Form),
            _ => Err(format!("unknown template: {s}")),
        }
    }
}

impl fmt::Display for Template {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::LandingPage => write!(f, "landing_page"),
            Self::Dashboard => write!(f, "dashboard"),
            Self::Form => write!(f, "form"),
        }
    }
}

/// HTML 原型生成器
///
/// 提供快速生成可预览 HTML 原型页面的能力
pub struct HtmlProtoGenerator {
    /// 输出目录，生成的 HTML 文件将保存在此目录
    output_dir: PathBuf,
    /// 页面标题，将显示在生成的 HTML 标题栏
    title: String,
}

impl HtmlProtoGenerator {
    /// 创建新的生成器
    pub fn new(output_dir: impl AsRef<Path>, title: impl Into<String>) -> Self {
        Self {
            output_dir: output_dir.as_ref().to_path_buf(),
            title: title.into(),
        }
    }

    /// 使用指定模板生成 HTML 文件，返回生成的文件路径
    pub fn generate(&self, template: Template) -> Result<PathBuf, String> {
        let html = match template {
            Template::LandingPage => self.render_landing_page(),
            Template::Dashboard => self.render_dashboard(),
            Template::Form => self.render_form(),
        };

        fs::create_dir_all(&self.output_dir)
            .map_err(|e| format!("创建输出目录失败: {e}"))?;

        let filename = format!("{}.html", template);
        let file_path = self.output_dir.join(&filename);

        fs::write(&file_path, html)
            .map_err(|e| format!("写入 HTML 文件失败: {e}"))?;

        Ok(file_path)
    }

    /// 生成自定义内容的 HTML 文件
    pub fn generate_custom(&self, filename: &str, body_content: &str) -> Result<PathBuf, String> {
        let html = self.wrap_html(body_content);

        fs::create_dir_all(&self.output_dir)
            .map_err(|e| format!("创建输出目录失败: {e}"))?;

        let file_path = self.output_dir.join(filename);
        fs::write(&file_path, html)
            .map_err(|e| format!("写入 HTML 文件失败: {e}"))?;

        Ok(file_path)
    }

    // ── 内部渲染方法 ──────────────────────────────────────────────

    /// 包裹 HTML 骨架（Tailwind CDN + 标题）
    fn wrap_html(&self, body: &str) -> String {
        format!(
            r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 text-gray-900 antialiased">
{body}
</body>
</html>"#,
            title = self.title,
            body = body,
        )
    }

    /// 落地页模板
    fn render_landing_page(&self) -> String {
        let body = r##"
    <!-- Hero -->
    <section class="bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
        <div class="max-w-5xl mx-auto px-6 py-24 text-center">
            <h1 class="text-5xl font-bold mb-6">欢迎来到我们的产品</h1>
            <p class="text-xl text-indigo-100 mb-10 max-w-2xl mx-auto">
                一款帮助团队高效协作的现代化工具，让工作更简单、更专注。
            </p>
            <div class="flex gap-4 justify-center">
                <a href="#" class="bg-white text-indigo-700 font-semibold px-8 py-3 rounded-lg shadow hover:bg-indigo-50 transition">
                    立即开始
                </a>
                <a href="#features" class="border-2 border-white text-white font-semibold px-8 py-3 rounded-lg hover:bg-white/10 transition">
                    了解更多
                </a>
            </div>
        </div>
    </section>

    <!-- Features -->
    <section id="features" class="max-w-5xl mx-auto px-6 py-20">
        <h2 class="text-3xl font-bold text-center mb-14">核心功能</h2>
        <div class="grid md:grid-cols-3 gap-10">
            <div class="text-center">
                <div class="w-14 h-14 mx-auto mb-4 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-2xl font-bold">1</div>
                <h3 class="text-xl font-semibold mb-2">极速响应</h3>
                <p class="text-gray-500">毫秒级响应，让操作流畅无等待。</p>
            </div>
            <div class="text-center">
                <div class="w-14 h-14 mx-auto mb-4 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-2xl font-bold">2</div>
                <h3 class="text-xl font-semibold mb-2">安全可靠</h3>
                <p class="text-gray-500">端到端加密，数据安全有保障。</p>
            </div>
            <div class="text-center">
                <div class="w-14 h-14 mx-auto mb-4 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-2xl font-bold">3</div>
                <h3 class="text-xl font-semibold mb-2">团队协作</h3>
                <p class="text-gray-500">实时同步，团队成员随时掌握进度。</p>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-gray-800 text-gray-400 text-center py-8">
        <p>&copy; 2026 我们的产品. All rights reserved.</p>
    </footer>"##;

        self.wrap_html(body)
    }

    /// 仪表盘模板
    fn render_dashboard(&self) -> String {
        let body = r##"
    <div class="flex h-screen">
        <!-- 侧边栏 -->
        <aside class="w-60 bg-gray-900 text-gray-300 flex flex-col">
            <div class="px-6 py-5 text-xl font-bold text-white tracking-wide border-b border-gray-700">
                Dashboard
            </div>
            <nav class="flex-1 px-3 py-4 space-y-1">
                <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800 text-white">
                    <span>📊</span> 概览
                </a>
                <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition">
                    <span>👥</span> 用户
                </a>
                <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition">
                    <span>📦</span> 项目
                </a>
                <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition">
                    <span>⚙️</span> 设置
                </a>
            </nav>
        </aside>

        <!-- 主内容区 -->
        <div class="flex-1 flex flex-col overflow-hidden">
            <!-- 顶栏 -->
            <header class="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
                <h2 class="text-lg font-semibold">概览</h2>
                <div class="flex items-center gap-4">
                    <span class="text-sm text-gray-500">管理员</span>
                    <div class="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center text-sm font-bold">A</div>
                </div>
            </header>

            <!-- 内容 -->
            <main class="flex-1 overflow-auto p-6">
                <!-- 统计卡片 -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div class="bg-white rounded-xl shadow p-5">
                        <p class="text-sm text-gray-500 mb-1">总用户数</p>
                        <p class="text-3xl font-bold">1,234</p>
                    </div>
                    <div class="bg-white rounded-xl shadow p-5">
                        <p class="text-sm text-gray-500 mb-1">活跃项目</p>
                        <p class="text-3xl font-bold">56</p>
                    </div>
                    <div class="bg-white rounded-xl shadow p-5">
                        <p class="text-sm text-gray-500 mb-1">本周提交</p>
                        <p class="text-3xl font-bold">328</p>
                    </div>
                    <div class="bg-white rounded-xl shadow p-5">
                        <p class="text-sm text-gray-500 mb-1">完成率</p>
                        <p class="text-3xl font-bold">87%</p>
                    </div>
                </div>

                <!-- 占位表格 -->
                <div class="bg-white rounded-xl shadow overflow-hidden">
                    <div class="px-6 py-4 border-b border-gray-200 font-semibold">最近活动</div>
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50 text-gray-500 text-left">
                            <tr>
                                <th class="px-6 py-3">名称</th>
                                <th class="px-6 py-3">状态</th>
                                <th class="px-6 py-3">更新时间</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            <tr><td class="px-6 py-3">项目 Alpha</td><td class="px-6 py-3"><span class="text-green-600">进行中</span></td><td class="px-6 py-3">2 小时前</td></tr>
                            <tr><td class="px-6 py-3">项目 Beta</td><td class="px-6 py-3"><span class="text-yellow-600">待审核</span></td><td class="px-6 py-3">5 小时前</td></tr>
                            <tr><td class="px-6 py-3">项目 Gamma</td><td class="px-6 py-3"><span class="text-gray-400">已归档</span></td><td class="px-6 py-3">1 天前</td></tr>
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    </div>"##;

        self.wrap_html(body)
    }

    /// 表单页模板
    fn render_form(&self) -> String {
        let body = r##"
    <div class="min-h-screen flex items-center justify-center px-4 py-12">
        <div class="w-full max-w-md">
            <h1 class="text-3xl font-bold text-center mb-2">用户注册</h1>
            <p class="text-gray-500 text-center mb-8">请填写以下信息创建账户</p>

            <form class="bg-white rounded-xl shadow-lg p-8 space-y-5">
                <div>
                    <label class="block text-sm font-medium mb-1">用户名</label>
                    <input type="text" placeholder="请输入用户名"
                        class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">邮箱</label>
                    <input type="email" placeholder="you@example.com"
                        class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                </div>

                <div>
                    <label class="block text-sm font-medium mb-1">密码</label>
                    <input type="password" placeholder="至少 8 位"
                        class="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                </div>

                <div class="flex items-center gap-2">
                    <input type="checkbox" id="terms" class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                    <label for="terms" class="text-sm text-gray-600">我已阅读并同意服务条款</label>
                </div>

                <button type="submit"
                    class="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-lg hover:bg-indigo-700 transition">
                    注册
                </button>

                <p class="text-center text-sm text-gray-500">
                    已有账户？<a href="#" class="text-indigo-600 hover:underline">登录</a>
                </p>
            </form>
        </div>
    </div>"##;

        self.wrap_html(body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_template_from_str() {
        use std::str::FromStr;
        assert_eq!(Template::from_str("landing"), Ok(Template::LandingPage));
        assert_eq!(Template::from_str("dashboard"), Ok(Template::Dashboard));
        assert_eq!(Template::from_str("form"), Ok(Template::Form));
        assert!(Template::from_str("unknown").is_err());
    }

    #[test]
    fn test_generate_landing_page() {
        let dir = std::env::temp_dir().join("html_proto_test_landing");
        let _ = fs::remove_dir_all(&dir);

        let gen = HtmlProtoGenerator::new(&dir, "测试页面");
        let path = gen.generate(Template::LandingPage).unwrap();

        assert!(path.exists());
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("tailwindcss"));
        assert!(content.contains("测试页面"));
        assert!(content.contains("欢迎来到"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_generate_dashboard() {
        let dir = std::env::temp_dir().join("html_proto_test_dashboard");
        let _ = fs::remove_dir_all(&dir);

        let gen = HtmlProtoGenerator::new(&dir, "仪表盘");
        let path = gen.generate(Template::Dashboard).unwrap();

        assert!(path.exists());
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("Dashboard"));
        assert!(content.contains("概览"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_generate_form() {
        let dir = std::env::temp_dir().join("html_proto_test_form");
        let _ = fs::remove_dir_all(&dir);

        let gen = HtmlProtoGenerator::new(&dir, "注册");
        let path = gen.generate(Template::Form).unwrap();

        assert!(path.exists());
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("用户注册"));
        assert!(content.contains("<form"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_generate_custom() {
        let dir = std::env::temp_dir().join("html_proto_test_custom");
        let _ = fs::remove_dir_all(&dir);

        let gen = HtmlProtoGenerator::new(&dir, "自定义");
        let path = gen.generate_custom("custom.html", "<p>Hello</p>").unwrap();

        assert!(path.exists());
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("<p>Hello</p>"));

        let _ = fs::remove_dir_all(&dir);
    }
}
