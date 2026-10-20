import { createHash } from 'node:crypto';
import { accessSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

export type AndroidBuildCapabilities = {
  java: boolean;
  gradle: boolean;
  androidSdk: boolean;
  artifactStorageCredentialsPresent: boolean;
  /** True only when this runtime itself can invoke Java, Gradle, and the Android SDK. */
  localBuildable: boolean;
  /** Configuration switch for the external GitHub Actions queue worker; not a live health check. */
  hostedWorkerEnabled: boolean;
  /** True when at least one build execution path is configured. */
  buildable: boolean;
  buildMode: 'local' | 'hosted-github-actions' | 'unavailable';
  missing: string[];
};

export type AndroidBuildResult = {
  apkPath: string;
  sizeBytes: number;
  sha256: string;
  command: string;
};

export function verifyAndroidApk(bytes: Uint8Array, expectedSize: number, expectedSha256: string) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || bytes.byteLength !== expectedSize) return false;
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  return createHash('sha256').update(bytes).digest('hex') === expectedSha256;
}

const MAX_BUILD_MS = 10 * 60 * 1000;
let activeBuild = false;

function commandExists(command: string, pathValue = process.env.PATH || '') {
  return pathValue.split(delimiter).some(directory => directory && (process.platform === 'win32'
    ? [`${command}.exe`, `${command}.bat`, `${command}.cmd`].some(extension => requirePath(join(directory, extension)))
    : requirePath(join(directory, command))));
}

function requirePath(path: string) {
  try { accessSync(path); return true; } catch { return false; }
}

export function getAndroidBuildCapabilities(env: NodeJS.ProcessEnv = process.env): AndroidBuildCapabilities {
  const java = Boolean(env.JAVA_HOME?.trim() && requirePath(join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')))
    || commandExists('java', env.PATH);
  const gradle = Boolean(env.GRADLE_HOME?.trim() && requirePath(join(env.GRADLE_HOME, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle')))
    || commandExists('gradle', env.PATH);
  const sdkRoot = env.ANDROID_HOME?.trim() || env.ANDROID_SDK_ROOT?.trim();
  const sdk = Boolean(sdkRoot && requirePath(join(sdkRoot, 'platforms', 'android-35')));
  const localMissing = [!java && 'Java (JAVA_HOME or PATH)', !gradle && 'Gradle (GRADLE_HOME or PATH)', !sdk && 'Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT)'].filter(Boolean) as string[];
  const localBuildable = localMissing.length === 0;
  const hostedWorkerEnabled = env.ANDROID_HOSTED_WORKER_ENABLED?.trim().toLowerCase() === 'true';
  const artifactStorageCredentialsPresent = Boolean((env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim()) && env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const buildable = localBuildable || hostedWorkerEnabled;
  const buildMode = localBuildable ? 'local' : hostedWorkerEnabled ? 'hosted-github-actions' : 'unavailable';
  return {
    java, gradle, androidSdk: sdk, artifactStorageCredentialsPresent,
    localBuildable, hostedWorkerEnabled, buildable, buildMode,
    // Missing local tools remain available for diagnostics even when the hosted path is configured.
    missing: localMissing,
  };
}

function run(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: 'ignore', shell: process.platform === 'win32' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Android build timed out after 10 minutes.')); }, MAX_BUILD_MS);
    child.once('error', error => { clearTimeout(timer); reject(new Error(`Android build could not start: ${error.message}`)); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Gradle failed with exit code ${code ?? 'unknown'}.`)); });
  });
}

export function createCalculatorAndroidProject(): Record<string, string> {
  return {
    'settings.gradle': "pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name = 'LeonardXCalculator'\ninclude ':app'\n",
    'build.gradle': "plugins { id 'com.android.application' version '8.7.3' apply false }\n",
    'gradle.properties': 'org.gradle.jvmargs=-Xmx1536m\nandroid.useAndroidX=true\n',
    'app/build.gradle': "plugins { id 'com.android.application' }\n\nandroid { namespace 'com.leonardx.calculator'; compileSdk 35\n defaultConfig { applicationId 'com.leonardx.calculator'; minSdk 23; targetSdk 35; versionCode 1; versionName '1.0' } }\n",
    'app/src/main/AndroidManifest.xml': "<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\"><application android:theme=\"@style/AppTheme\" android:label=\"LeonardX Calculator\"><activity android:name=\".MainActivity\" android:screenOrientation=\"portrait\" android:exported=\"true\"><intent-filter><action android:name=\"android.intent.action.MAIN\"/><category android:name=\"android.intent.category.LAUNCHER\"/></intent-filter></activity></application></manifest>\n",
    'app/src/main/res/values/styles.xml': "<resources><style name=\"AppTheme\" parent=\"android:style/Theme.Material.Light.NoActionBar\"><item name=\"android:fontFamily\">sans</item><item name=\"android:colorAccent\">#d7aa70</item></style></resources>\n",
    'app/src/main/java/com/leonardx/calculator/MainActivity.java': `package com.leonardx.calculator;
import android.app.Activity; import android.os.Bundle; import android.graphics.Color; import android.view.View; import android.widget.*;
public final class MainActivity extends Activity { private final StringBuilder input = new StringBuilder(); private TextView display;
 public void onCreate(Bundle state) { super.onCreate(state); LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(24,24,24,24); display = new TextView(this); display.setText("0"); display.setTextSize(32); display.setTextColor(Color.BLACK); root.addView(display, new LinearLayout.LayoutParams(-1,0,1)); String[] keys={"7","8","9","/","4","5","6","*","1","2","3","-","0",".","C","+","="}; LinearLayout row=null; for(int i=0;i<keys.length;i++){ if(i%4==0){row=new LinearLayout(this); root.addView(row,new LinearLayout.LayoutParams(-1,0,1));} Button b=new Button(this); b.setText(keys[i]); b.setOnClickListener(v->press(((Button)v).getText().toString())); row.addView(b,new LinearLayout.LayoutParams(0,-1,1)); } setContentView(root); }
 private void press(String key){ if(key.equals("C")){input.setLength(0); display.setText("0"); return;} if(key.equals("=")){try{display.setText(evaluate(input.toString()));}catch(ArithmeticException e){display.setText("Cannot divide by zero");}catch(Exception e){display.setText("Error");} return;} input.append(key); display.setText(input.toString()); }
 private String evaluate(String s){ if(s.isEmpty()) return "0"; Parser parser=new Parser(s); double result=parser.expression(); if(parser.index!=parser.value.length()) throw new IllegalArgumentException(); return String.valueOf(result); }
 private static final class Parser { final String value; int index=0; Parser(String value){this.value=value;} double expression(){double n=term(); while(index<value.length()){char op=value.charAt(index); if(op!='+'&&op!='-') break; index++; double rhs=term(); n=op=='+'?n+rhs:n-rhs;} return n;} double term(){double n=factor(); while(index<value.length()){char op=value.charAt(index); if(op!='*'&&op!='/') break; index++; double rhs=factor(); if(op=='/'&&rhs==0) throw new ArithmeticException("Division by zero"); n=op=='*'?n*rhs:n/rhs;} return n;} double factor(){if(index>=value.length()) throw new IllegalArgumentException(); char sign=value.charAt(index); if(sign=='+'||sign=='-'){index++; double n=factor(); return sign=='-'?-n:n;} int start=index; boolean digit=false; while(index<value.length()){char c=value.charAt(index); if(c>='0'&&c<='9'){digit=true;index++;} else if(c=='.'){index++;} else break;} if(!digit) throw new IllegalArgumentException(); return Double.parseDouble(value.substring(start,index));} }
}`,
  };
}

export async function buildAndroidApk(files: Record<string, string>, outputRoot = join(homedir(), '.leonardx', 'android-artifacts')): Promise<AndroidBuildResult> {
  const capabilities = getAndroidBuildCapabilities();
  if (!capabilities.localBuildable) throw new Error(`Android builds are unavailable in this runtime. Missing: ${capabilities.missing.join(', ')}.`);
  if (activeBuild) throw new Error('Another Android build is already running. Retry after it completes.');
  if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length < 1 || Object.keys(files).length > 250) {
    throw new Error('Android source files must be a bounded path-to-content map.');
  }
  const totalBytes = Object.entries(files).reduce((total, [relative, content]) => {
    const resolved = resolve(relative);
    if (!relative || isAbsolute(relative) || resolved === '..' || resolved.startsWith(`..${sep}`) || relative.split(/[\\/]/).includes('..')) {
      throw new Error('Android source contains an unsafe project path.');
    }
    if (typeof content !== 'string') throw new Error('Android source file contents must be text.');
    return total + Buffer.byteLength(content, 'utf8');
  }, 0);
  if (totalBytes > 2 * 1024 * 1024) throw new Error('Android project source exceeds the 2 MB limit.');
  activeBuild = true;
  let work: string | undefined;
  try {
    work = await mkdtemp(join(tmpdir(), 'leonardx-android-'));
    for (const [relative, content] of Object.entries(files)) { const target = join(work, relative); await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, content, 'utf8'); }
    const gradle = process.env.GRADLE_HOME ? join(process.env.GRADLE_HOME, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle') : 'gradle';
    await run(gradle, [':app:assembleDebug', '--no-daemon', '--stacktrace'], work);
    const apkPath = join(work, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    const apk = await readFile(apkPath);
    if (apk.length === 0) throw new Error('Gradle reported success but produced an empty APK.');
    await mkdir(outputRoot, { recursive: true }); const persisted = join(outputRoot, `calculator-${Date.now()}.apk`); await writeFile(persisted, apk);
    return { apkPath: persisted, sizeBytes: apk.length, sha256: createHash('sha256').update(apk).digest('hex'), command: `${gradle} :app:assembleDebug --no-daemon` };
  } finally { activeBuild = false; if (work) await rm(work, { recursive: true, force: true }); }
}
