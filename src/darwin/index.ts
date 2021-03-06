import fs from "fs-extra";
import path from "path";
import { spawn } from "child_process";
//@ts-ignore
import qode from "@nodegui/qode";
//@ts-ignore
import { qtHome } from "@nodegui/nodegui/config/qtConfig";
const cwd = process.cwd();
const deployDirectory = path.resolve(cwd, "deploy");
const configFile = path.resolve(deployDirectory, "config.json");

const copyQode = async (dest: string) => {
  const qodeBinaryFile = qode.qodePath;
  await fs.chmod(qodeBinaryFile, "755");
  await fs.copyFile(qodeBinaryFile, path.resolve(dest, "qode"));
};

const copyAppDist = async (distPath: string, resourceDir: string) => {
  await fs.copy(distPath, path.resolve(resourceDir, "dist"), {
    recursive: true
  });
};

function getAllNodeAddons(dirPath: string) {
  const addonExt = "node";
  let dir = fs.readdirSync(dirPath);
  return dir
    .filter(elm => elm.match(new RegExp(`.*\.(${addonExt})`, "ig")))
    .map(eachElement => path.resolve(dirPath, eachElement));
}

const addonCommands = (addonPaths: string[]): string[] => {
  return addonPaths.reduce((commandList: string[], currentAddon) => {
    commandList.push(`-executable=${currentAddon}`);
    return commandList;
  }, []);
};

export type macDeployQtOptions = {
  appName: string;
  buildDir: string;
  resourceDir: string;
  identity?: string;
};

const runMacDeployQt = async ({
  appName,
  buildDir,
  identity,
  resourceDir
}: macDeployQtOptions) => {
  const macDeployQtBin = path.resolve(qtHome, "bin", "macdeployqt");
  try {
    await fs.chmod(macDeployQtBin, "755");
  } catch (err) {
    console.warn(`Warning: Tried to fix permission for macdeployqt but failed`);
  }
  const distPath = path.resolve(resourceDir, "dist");
  const allAddons = getAllNodeAddons(distPath);

  const options = [
    `${appName}.app`,
    "-dmg",
    "-verbose=3",
    `-libpath=${qode.qtHome}`,
    ...addonCommands(allAddons)
  ];

  if (identity) {
    options.push(`-codesign=${identity}`);
  }

  const macDeployQt = spawn(macDeployQtBin, options, { cwd: buildDir });

  return new Promise((resolve, reject) => {
    macDeployQt.stdout.on("data", function(data) {
      console.log("stdout: " + data.toString());
    });

    macDeployQt.stderr.on("data", function(data) {
      console.log("stderr: " + data.toString());
    });

    macDeployQt.on("exit", function(code) {
      if (!code) {
        return resolve();
      }
      return reject("child process exited with code " + code);
    });
  });
};

export const init = async (appName: string) => {
  const config = {
    appName: null
  };
  const templateDirectory = path.resolve(__dirname, "../../template/darwin");
  const userTemplate = path.resolve(deployDirectory, "darwin");
  const appDir = path.resolve(userTemplate, `${appName}.app`);
  await fs.mkdirp(path.resolve(userTemplate, appDir));
  await fs.copy(templateDirectory, appDir, { recursive: true });
  Object.assign(config, { appName });
  await fs.writeJSON(configFile, config);
};

export const pack = async (distPath: string, identity?: string) => {
  const config = await fs.readJSON(
    path.resolve(deployDirectory, "config.json")
  );
  const { appName } = config;
  const usertemplate = path.resolve(deployDirectory, "darwin");
  const templateAppDir = path.resolve(usertemplate, `${appName}.app`);
  const buildDir = path.resolve(usertemplate, "build");
  const buildAppPackage = path.resolve(buildDir, `${appName}.app`);
  const Contents = path.resolve(buildAppPackage, "Contents");
  const MacOs = path.resolve(Contents, "MacOs");
  const resourceDir = path.resolve(Contents, "Resources");
  console.log(`cleaning build directory at ${buildDir}`);
  await fs.remove(buildDir);
  console.log(`creating build directory at ${buildDir}`);
  await fs.copy(templateAppDir, buildAppPackage, { recursive: true });
  console.log(`copying qode`);
  await copyQode(MacOs);
  console.log(`copying dist`);
  await copyAppDist(distPath, resourceDir);
  console.log(`running macdeployqt`);

  await runMacDeployQt({ appName, buildDir, resourceDir, identity });

  console.log(`Build successful. Find the dmg/app at ${buildDir}`);
};
