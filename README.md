# 小店排队取号

这是一个适合小餐馆使用的排队取号网页应用，网页部署在 GitHub Pages，顾客数据存储在 Supabase。

## 使用

1. 在 Supabase 的 SQL Editor 执行 [`supabase/schema.sql`](supabase/schema.sql)。
2. 在 Supabase Authentication > Users 创建一个家人共用的商家账号。
3. 将网页发布到 GitHub Pages。
4. iPad 和爸爸手机打开同一个网址，使用商家账号登录。

数据包括姓名、手机号、人数、桌型、状态、叫号时间和排队顺序。Supabase 的 Row Level Security 只允许登录后的家人访问这些资料。iPad 和手机会每 15 秒自动刷新，也可以点“刷新”立即同步。

商家队列的操作逻辑是：等待中的顾客显示在三类队列里；点击“叫号”后，顾客从等待队列移到“刚刚叫到”和“已叫号，等待确认入座”，这一步不会自动入座；顾客实际坐下后点击“已入座”，并确认提示。点击“弃号”会保留记录但不再排队。点击“置顶”会把顾客放到当前分类第一位。

如果已经执行过旧版数据库脚本，请在 Supabase SQL Editor 额外执行：

```sql
alter table public.queue_entries
alter column queue_position type bigint using queue_position::bigint;
```

如果已经执行过“开始新一天”的旧版函数，请执行 [`supabase/migration-active-day.sql`](supabase/migration-active-day.sql)。新版会记录营业日开始时间，让页面隐藏旧营业日记录，但历史数据仍保留在数据库和导出中。

桌型规则固定为：1–4 人（small）、5–8 人（medium）、9 人及以上（large）。

部署 GitHub Pages 时只使用 Supabase Project URL 和 publishable/anon key，绝对不要把 service role key 放进网页代码。

## 本地运行

在项目目录运行：

```bash
python3 -m http.server 4173
```

然后访问 <http://localhost:4173>。正式使用时，将整个项目上传到 GitHub，并在仓库 Settings > Pages 中选择从 `main` 分支根目录发布。

## GitHub Pages 发布

1. 在 GitHub 新建一个 private repository（如果账号方案支持，优先设为 private）。
2. 上传本目录全部文件，包括 `config.js`、`supabase/schema.sql`。
3. 进入仓库 Settings > Pages。
4. Source 选择 GitHub Actions 或 Deploy from a branch，选择 `main` 和 `/ (root)`。
5. 发布完成后，在 iPad 和爸爸手机打开 GitHub Pages 地址。
6. 登录后将网页添加到主屏幕。

`config.js` 中的 Project URL 和 publishable key 可以出现在网页中；数据库密码、家人登录密码和 service role/secret key 不能上传 GitHub。
