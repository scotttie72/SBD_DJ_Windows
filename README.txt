BOOTH for Windows and Android (flat version: no folders, so GitHub's web upload works)

WHAT TO DO
1. On github.com create a new repository (private is fine).
2. Click Add file > Upload files. Drag in ALL the files from this folder EXCEPT workflow-build.yml.txt
   (13 files: main.js, server.js, remote.js, index.html, remote.html, sw.js, manifest.webmanifest,
   package.json, capacitor.config.json, three .png icons, and this README if you like). Commit.
3. Click Add file > Create new file. In the name box type exactly:
       .github/workflows/build.yml
   (typing the slashes makes the folders). Open workflow-build.yml.txt, copy everything, paste it in, and Commit.
4. Open the Actions tab, choose Build Booth, press Run workflow. After about 10 minutes open the finished run
   and download booth-windows (installer and portable .exe) and booth-android (.apk).

Windows warns that the app is not code-signed: choose More info, then Run anyway.
Android: open the .apk on the phone and allow installs from that source. It is a debug build.

TO UPDATE LATER: replace index.html, sw.js and manifest.webmanifest in the repository with newer copies
(open the file on GitHub, use the pencil icon or Add file > Upload files with the same name), then run the workflow again.

PHONE REMOTE (Windows app only): in the Booth window tick "Allow phone remote on this Wi-Fi network", pick a PIN,
open the shown address on your phone's browser on the same Wi-Fi, and type the PIN.
