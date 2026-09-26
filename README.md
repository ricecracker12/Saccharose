# Saccharose.wiki (bản fork tiếng Việt – nhánh `nguyen`)

Đây là bản fork của [kwwxis/Saccharose](https://github.com/kwwxis/Saccharose), chỉnh sửa để sinh wikitext
**Thất Thánh Triệu Hồi (TCG)** bằng tiếng Việt. Chỉ phần TCG của Genshin Impact được dùng; các phần khác
(HSR, ZZZ, WuWa, công cụ khác) vẫn còn trong code nhưng không được hỗ trợ trên bản fork này.

## Nhánh

- `master`: chỉ dùng để đồng bộ với repo gốc, không commit trực tiếp.
- `nguyen`: toàn bộ sửa đổi của bản fork.

Cập nhật từ repo gốc:

```shell
git switch master
git pull --ff-only            # master theo dõi upstream/master
git push origin master
git switch nguyen
git merge master
git push
```

## Yêu cầu

- Git (trên Windows cần Git Bash)
- Node.js `24.12.0` và npm `11.6.2` (theo `engines` trong `package.json`)
- PostgreSQL (bắt buộc – cả dữ liệu site lẫn dữ liệu game đều nằm trong PostgreSQL)
  - Trên Windows, cài trong WSL: https://learn.microsoft.com/en-us/windows/wsl/install-manual
  - Nếu truy cập từ máy khác, sửa `postgresql.conf`: `listen_addresses = '*'`
- Redis (không bắt buộc, nhưng nên có để cache lâu dài)
- Python 3 + PIP `pycld2` (không bắt buộc – chỉ dùng để đoán ngôn ngữ khi tìm kiếm; bỏ trống `PYTHON_COMMAND` để tắt)

## Cài đặt

1. Clone và chuyển sang nhánh `nguyen`:
   ```shell
   git clone https://github.com/ricecracker12/Saccharose.git
   cd Saccharose
   git switch nguyen
   git remote add upstream https://github.com/kwwxis/Saccharose.git
   git fetch upstream
   git branch --set-upstream-to=upstream/master master
   ```
2. `npm install`
3. Trên Windows, cấu hình Bash làm shell cho npm script:
   - 64bit: `npm config set script-shell "C:\\Program Files\\git\\bin\\bash.exe"`
   - 32bit: `npm config set script-shell "C:\\Program Files (x86)\\git\\bin\\bash.exe"`
4. Nên cài `tsx` để chạy các script import: `npm install -g tsx`
5. Chép `.env.example` thành `.env` và cấu hình theo phần dưới.

### Cấu hình `.env`

Những điểm khác so với repo gốc:

- **PostgreSQL:** bản fork dùng chung một máy chủ PostgreSQL cho site và dữ liệu game.
  Kết nối tới database game dùng `POSTGRES_SITE_HOST`, `POSTGRES_SITE_USER`, `POSTGRES_SITE_PASSWORD`,
  `POSTGRES_SITE_PORT` (mặc định `5432`); các biến `POSTGRES_GAMEDATA_HOST/USER/PASSWORD/PORT` không được dùng.
  ```dotenv
  POSTGRES_SITE_HOST=localhost
  POSTGRES_SITE_USER=...
  POSTGRES_SITE_PASSWORD=...
  POSTGRES_SITE_DATABASE=saccharose
  POSTGRES_GAMEDATA_DATABASE_GENSHIN=genshin
  ```
- **Tắt các game không dùng:** dùng các biến `*_DISABLED` (`.env.example` đã tắt sẵn HSR, ZZZ, WuWa).
  Khi đã tắt, có thể bỏ trống `POSTGRES_GAMEDATA_DATABASE_*` và `*_DATA_ROOT` của game đó.
  Nếu `.env` của bạn được tạo từ bản cũ và còn các dòng `*_ENABLED`, hãy thay bằng `*_DISABLED` vì code không đọc `*_ENABLED`.
  ```dotenv
  HSR_DISABLED=true
  ZENLESS_DISABLED=true
  WUWA_DISABLED=true
  ```
  Vẫn giữ các khóa `EXT_HSR_IMAGES=`, `EXT_ZENLESS_IMAGES=`, `EXT_WUWA_IMAGES=` trong `.env` (để trống cũng được).
- **Shell:** bắt buộc có Bash (dùng lệnh `grep`).
  - Windows:
    ```dotenv
    SHELL_PATH='/mingw64/bin:/usr/local/bin:/usr/bin:/bin:/mingw64/bin:/usr/bin'
    SHELL_EXEC='C:/Program Files/Git/usr/bin/bash.exe'
    ```
  - Linux:
    ```dotenv
    SHELL_PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin
    SHELL_EXEC=/bin/bash
    ```
- **Đăng nhập Discord:** tạo ứng dụng Discord, điền `DISCORD_APP_CLIENT_ID` / `DISCORD_APP_CLIENT_SECRET`
  và thêm redirect URL `https://<WEB_DOMAIN>/auth/callback`.
- **Secrets:** điền `SESSION_SECRET`, `JWT_SECRET`, `CSRF_TOKEN_SECRET` bằng chuỗi ngẫu nhiên.

### Tên miền hợp lệ

Server từ chối mọi request có `Host` không nằm trong `VALID_HOSTS` ở
[`src/backend/middleware/request/antiBots.ts`](src/backend/middleware/request/antiBots.ts).
Bản fork đã thêm `localhost:3001`, `127.0.0.1:3001` và `sucrose.banhgao.net`. Nếu chạy trên tên miền hoặc cổng khác,
thêm vào danh sách này (kèm cổng nếu không phải 80/443).

### SSL

Nếu chạy sau reverse proxy (Nginx, Cloudflare…) thì không cần SSL trong app:

```dotenv
VHOSTED=0
HTTP_PORT=3001
SSL_ENABLED=false
TRUST_PROXY=true
```

Chạy local không SSL: như trên với `TRUST_PROXY=false`, truy cập `http://localhost:3001/`.

<details>
<summary>Tự tạo chứng chỉ SSL cho local (tùy chọn)</summary>

1. Tạo file `openssl.<WEB_DOMAIN>.cnf`:
   ```
   authorityKeyIdentifier=keyid,issuer
   basicConstraints=CA:FALSE
   keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
   subjectAltName=DNS:<WEB_DOMAIN>
   ```
2. `openssl genrsa -des3 -out rootSSL.key 2048`
3. `openssl req -x509 -new -nodes -key rootSSL.key -sha256 -days 1024 -out rootSSL.pem`
4. Tạo key và CSR:
   ```shell
   openssl req \
    -new -sha256 -nodes \
    -out <WEB_DOMAIN>.csr \
    -newkey rsa:2048 -keyout <WEB_DOMAIN>.key \
    -subj "//C=<2LetterCountryCode>\ST=<StateFullName>\L=<CityFullName>\O=<OrganizationName>\OU=<OrganizationUnitName>\CN=<WEB_DOMAIN>\emailAddress=<EmailAddress>"
   ```
5. Ký chứng chỉ:
   ```shell
   openssl x509 \
    -req \
    -in <WEB_DOMAIN>.csr \
    -CA rootSSL.pem -CAkey rootSSL.key -CAcreateserial \
    -out <WEB_DOMAIN>.crt \
    -days 500 \
    -sha256 \
    -extfile openssl.<WEB_DOMAIN>.cnf
   ```
6. Trong `.env`: `SSL_ENABLED=true`, `SSL_KEY=.../<WEB_DOMAIN>.key`, `SSL_CERT=.../<WEB_DOMAIN>.crt`, `SSL_CA=.../rootSSL.pem`
7. Đăng ký `rootSSL.pem` là CA tin cậy trên hệ điều hành.

</details>

## Cơ sở dữ liệu

Các file SQL nằm trong `src/pipeline/`.

1. **Database site** (tên = `POSTGRES_SITE_DATABASE`):
   ```sql
   CREATE DATABASE saccharose;
   ```
   Rồi chạy `src/pipeline/PG_SITEDB_SETUP.sql` trên database này.
   Dòng `CREATE EXTENSION bktree;` cần extension [pg-spgist_hamming](https://github.com/fake-name/pg-spgist_hamming)
   (chỉ phục vụ tính năng media-search). Nếu không cài extension này, bỏ dòng đó trước khi chạy.
2. **Database Genshin** (tên = `POSTGRES_GAMEDATA_DATABASE_GENSHIN`):
   ```sql
   CREATE DATABASE genshin;
   ```
   Rồi chạy lần lượt `src/pipeline/PG_GAMEDATADB_SETUP.sql` và `src/pipeline/PG_GENSHINDATADB_SETUP.sql` trên database này.
3. **Cấp quyền truy cập:** sau khi đăng nhập Discord, site chỉ cho vào nếu tài khoản đã liên kết một tài khoản
   Fandom wiki đủ điều kiện (autoconfirmed, ≥ 100 sửa đổi) hoặc có trong bảng bypass. Thêm Discord ID vào bảng bypass
   trên database site (làm trước hay sau lần đăng nhập đầu tiên đều được):
   ```sql
   INSERT INTO site_user_wiki_bypass (discord_id, comment) VALUES ('<discord_id>', 'admin');
   ```

## Dữ liệu game (Genshin)

Làm lại các bước này sau mỗi phiên bản Genshin mới. Chạy từ thư mục repo. Mỗi lần chạy `import_genshin_files.ts`
chỉ được truyền một cờ.

Schema của Saccharose dùng **tên trường của bản 5.4**. Dữ liệu các bản mới hơn đã đổi tên hoặc làm rối nhiều trường
(ví dụ `id` của `DialogExcelConfigData` thành `GFLDJMJKIKE`), nên phải "giải mã" bằng cách đối chiếu giá trị với bản
5.4 trước khi import. Bỏ qua bước này thì `import_db` sẽ lỗi `null value in column "Id"`.

### Bố trí thư mục

Không dùng trực tiếp thư mục git clone làm `GENSHIN_DATA_ROOT`, vì các bước dưới đây ghi đè `ExcelBinOutput` và
`BinOutput`. Ví dụ bố trí (trên VPS):

```
~/sucrose/AnimeGameData/     git clone bộ dữ liệu (bản mới nhất, lịch sử có bản 5.4)
~/sucrose/archives/          GENSHIN_ARCHIVES
    5.4/ExcelBinOutput/      trích từ commit 5.4
    5.4/BinOutput/...        trích từ commit 5.4
~/sucrose/genshin-data/      GENSHIN_DATA_ROOT (thư mục làm việc)
    ExcelBinOutput.Raw  ->   symlink tới AnimeGameData/ExcelBinOutput
    BinOutput.Raw       ->   symlink tới AnimeGameData/BinOutput
    Readable, Subtitle  ->   symlink tới AnimeGameData/...
    TextMap/                 bản sao (normalize-tm ghi file vào đây)
    ExcelBinOutput/, BinOutput/   do các bước deobf / make-excels sinh ra
```

1. **Chuẩn bị bản 5.4 và thư mục làm việc** (chỉ cần làm lần đầu, trừ bước cập nhật TextMap).

   Nếu kho có bản 5.4 (kho cũ `AnimeGameData`) không cập nhật tới phiên bản mới nhất, dùng hai kho: kho cũ chỉ để
   trích bản 5.4, còn dữ liệu thô bản mới lấy từ kho mới (`animegamedata2`), thay đường dẫn tương ứng ở các lệnh `ln` bên dưới.
   ```shell
   cd ~/sucrose/AnimeGameData
   git log --oneline | grep -E "5\.4\."        # chọn commit 5.4 mới nhất, ví dụ abc1234
   mkdir -p ~/sucrose/archives/5.4
   git archive abc1234 ExcelBinOutput BinOutput/Quest BinOutput/Talk BinOutput/Voice/Items BinOutput/InterAction/QuestDialogue \
     | tar -x -C ~/sucrose/archives/5.4

   mkdir -p ~/sucrose/genshin-data && cd ~/sucrose/genshin-data
   ln -sfn ~/sucrose/AnimeGameData/ExcelBinOutput ExcelBinOutput.Raw
   ln -sfn ~/sucrose/AnimeGameData/BinOutput      BinOutput.Raw
   ln -sfn ~/sucrose/AnimeGameData/Readable       Readable
   ln -sfn ~/sucrose/AnimeGameData/Subtitle       Subtitle
   rm -rf TextMap && cp -r ~/sucrose/AnimeGameData/TextMap TextMap   # làm lại sau mỗi lần cập nhật dữ liệu
   ```
   Trong `.env`:
   ```dotenv
   GENSHIN_DATA_ROOT=/home/ubuntu/sucrose/genshin-data
   GENSHIN_ARCHIVES=/home/ubuntu/sucrose/archives
   ```
   Cập nhật dữ liệu game mới: `git -C ~/sucrose/AnimeGameData pull`, chép lại `TextMap`, rồi chạy tiếp từ bước 2.

2. **Giải mã và dựng excel** (trước khi import DB, đúng thứ tự):
   ```shell
   npx tsx ./src/backend/importer/genshin/import_genshin_files.ts --deobf-excel
   npx tsx ./src/backend/importer/genshin/import_genshin_files.ts --deobf-bin
   npx tsx ./src/backend/importer/genshin/import_genshin_files.ts --make-excels
   ```
   - `--deobf-excel`: đọc `ExcelBinOutput.Raw`, đổi tên trường theo bản 5.4, ghi ra `ExcelBinOutput`. Tốn CPU và có thể chạy lâu.
   - `--deobf-bin`: làm tương tự cho các thư mục cần dùng trong `BinOutput.Raw` → `BinOutput`.
   - `--make-excels`: dựng `MainQuest`, `Quest`, `Talk`, `Dialog`, `DialogUnparented`, `CodexQuest`,
     `FurnitureSuiteUnits` excel từ `BinOutput` (game không còn xuất đầy đủ các excel này).

3. **Normalize** (trước khi import DB):
   ```shell
   npx tsx ./src/backend/importer/genshin/import_genshin_files.ts --normalize-tm
   npx tsx ./src/backend/importer/genshin/import_genshin_files.ts --normalize-ex
   ```
   `--normalize-ex` xoá `TalkExcelConfigData_0/_1.json` trong `ExcelBinOutput` vì `TalkExcelConfigData.json` đã được
   `--make-excels` dựng lại đầy đủ.

4. **Các file hỗ trợ khác** (trước khi import DB):
   ```shell
   npx tsx ./src/backend/importer/genshin/import_genshin_files.ts --plaintext
   npx tsx ./src/backend/importer/genshin/import_genshin_files.ts --voice-items
   npx tsx ./src/backend/importer/genshin/import_genshin_files.ts --gcg-skill
   ```
   - `--plaintext`: tạo `TextMap/Plain/PlainTextMap<LangCode>_Hash.dat` và `_Text.dat`.
   - `--voice-items`: tạo `VoiceItems.json` từ `BinOutput/Voice/Items`.
   - `--gcg-skill`: tạo `GCGCharSkillDamage.json` từ `BinOutput/GCG/Gcg_DeclaredValueSet` (cần cho trang TCG).

5. **Import vào PostgreSQL:**
   ```shell
   npx tsx ./src/backend/importer/import_db.ts --game genshin --run-all
   ```
   Dùng `--help` để xem các tùy chọn khác (ví dụ `--run-only <bảng>` để import lại một vài bảng).

6. **Sau khi import DB:**
   ```shell
   npx tsx ./src/backend/importer/genshin/import_genshin_files.ts --index
   ```
   Tạo bảng `textmap_search_index` phục vụ tìm kiếm.

   Tùy chọn: `--changelog-tm <version>` rồi `--changelog-ex <version>` để trang TCG điền được phiên bản ở mục
   "Lịch Sử Cập Nhật" (nếu không, mục này hiện `<!-- phiên bản -->`).

## Ảnh

Ảnh Genshin được phục vụ từ thư mục `EXT_GENSHIN_IMAGES` (bắt buộc khai báo) tại URL `/images/genshin`.
Thiếu ảnh thì app vẫn chạy nhưng một số chỗ sẽ bị vỡ ảnh.

Chép vào thư mục đó các file trong `Texture2D` bắt đầu bằng `UI_`, `Eff_`, `Skill_`, `MonsterSkill`, và các file trong
`Sprite` bắt đầu bằng `UI_Gcg_Dice`, `UI_Gcg_Buff`, `UI_Gcg_Tag`, `UI_Buff`, `UI_HomeWorldTabIcon`:

```shell
find ./Texture2D/ -type f -regextype posix-extended -iregex '.*/(UI_|MonsterSkill|Eff_UI_Talent|.*Tutorial).*' -exec cp '{}' dist ';'
find ./Sprite/ -type f -regextype posix-extended -iregex '.*/(UI_Buff|UI_Gcg_Dice|UI_Gcg_Buff|UI_Gcg_Tag|UI_HomeWorldTabIcon).*' -exec cp '{}' dist ';'
rsync -avP ./dist hostname:/dest/path
```

## Build và chạy

- Build: `npm run build:dev` (hoặc `npm run build:prod`), rồi chạy `npm run start`.
  - Chỉ backend: `npm run backend:build`
  - Chỉ frontend: `npm run rspack:dev` hoặc `npm run rspack:prod`
- Phát triển với live-reload (chạy song song, thứ tự không quan trọng):
  - Backend: `npm run ts-serve:dev`
  - Frontend: `npm run rspack:dev:watch`

### Cấu trúc

- `/dist` – output build backend (gitignored)
- `/public/dist` – output build frontend (gitignored)
- `/src/backend` – code backend
- `/src/frontend` – code frontend
- `/src/shared` – code dùng chung cho cả frontend và backend
- `/src/pipeline` – script build và file SQL khởi tạo database
