const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { minimatch } = require("minimatch"); // Import minimatch for pattern matching

// Accepted file extensions for extraction
const extensions = ["js", "ts", "jsx", "tsx"];

// Directories and file patterns to ignore using wildcard patterns
const ignorePatterns = ["components/*.*", "*.svg"]; // Follow best wildcard practices

// Function to check if a file has an accepted extension
const isValidExtension = (file) => {
  const ext = path.extname(file).slice(1);
  return extensions.includes(ext) && !file.includes(".test.");
};

// Function to check if a file should be ignored using minimatch
const isIgnored = (file, baseDir) => {
  const relativePath = path.relative(baseDir, file).replace(/\\/g, "/"); // Normalize to forward slashes
  return ignorePatterns.some((pattern) => minimatch(relativePath, pattern));
};

// Function to minimize content for ChatGPT
const minimizeContent = (content) => {
  // Remove all newlines and trim leading/trailing spaces
  // Ensure the content is compact and single-lined
  return content
    .replace(/\s+/g, " ") // Replace all sequences of whitespace (tabs, newlines, etc.) with a single space
    .trim(); // Trim leading and trailing spaces
};

// Function to read file content
const readFileContent = async (filePath) => {
  const content = await fs.promises.readFile(filePath, "utf8");
  return minimizeContent(content);
};

// Function to ask user for confirmation or action in case of long files
const promptUser = (message) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `${message} (y - all, n - skip all, number to trim): `,
      (answer) => {
        rl.close();
        const trimmedAnswer = answer.trim().toLowerCase();
        if (trimmedAnswer === "y") {
          resolve({ action: "extract_all" });
        } else if (trimmedAnswer === "n") {
          resolve({ action: "skip_all" });
        } else if (!isNaN(trimmedAnswer) && Number(trimmedAnswer) > 0) {
          resolve({ action: "trim", lines: Number(trimmedAnswer) });
        } else {
          resolve({ action: "invalid" });
        }
      }
    );
  });
};

// Function to generate a directory tree
const generateTree = (dirPath, prefix = "") => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  let tree = "";

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const fullPath = path.join(dirPath, entry.name);

    tree += `${prefix}${connector}${entry.name}\n`;

    if (entry.isDirectory()) {
      tree += generateTree(fullPath, prefix + (isLast ? "    " : "│   "));
    }
  });

  return tree;
};

// Main function to extract file details
const extractFiles = async (dirPath) => {
  const allFiles = [];
  let extractAll = false;
  let skipAll = false;

  const readDir = async (currentPath) => {
    const entries = await fs.promises.readdir(currentPath, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await readDir(fullPath);
      } else if (
        isValidExtension(entry.name) &&
        !isIgnored(fullPath, dirPath)
      ) {
        allFiles.push(fullPath);
      }
    }
  };

  // Generate project tree
  const projectTree = generateTree(dirPath);

  console.log("Project Tree:\n");
  console.log(projectTree);
  console.log("\n");

  await readDir(dirPath);

  const blocks = [];
  for (const file of allFiles) {
    const relativePath = path.relative(dirPath, file);
    const content = await readFileContent(file);

    // Count lines in the original file (before minimization)
    const originalContent = await fs.promises.readFile(file, "utf8");
    const lineCount = originalContent.split("\n").length;

    if (lineCount > 300) {
      if (extractAll) {
        // Proceed to extract
      } else if (skipAll) {
        continue; // Skip this file
      } else {
        const response = await promptUser(
          `File "${relativePath}" has over ${lineCount} lines. Do you want to extract it?`
        );

        if (response.action === "extract_all") {
          extractAll = true;
        } else if (response.action === "skip_all") {
          skipAll = true;
          continue;
        } else if (response.action === "trim") {
          const trimLines = response.lines;
          const trimmedContent =
            originalContent.split("\n").slice(0, trimLines).join("\n") +
            "\n...";
          blocks.push(
            `** [${relativePath}] **\n${minimizeContent(trimmedContent)}`
          );
          continue;
        } else {
          console.log("Invalid input. Skipping this file.");
          continue;
        }
      }
    }

    blocks.push(`** [${relativePath}] **\n${content}`);
  }

  const fileContent = blocks.join("\n\n");
  const result = `Project Tree:\n\n${projectTree}\n\nExtracted Files:\n\n${fileContent}`;
  console.log(result);

  // Copy to clipboard (cross-platform)
  const { execSync } = require("child_process");
  const os = require("os");
  try {
    if (os.platform() === "darwin") {
      execSync(`echo "${result.replace(/"/g, '\\"')}" | pbcopy`);
    } else if (os.platform() === "win32") {
      execSync(`echo "${result.replace(/"/g, '""')}" | clip`);
    } else {
      execSync(
        `echo "${result.replace(/"/g, '\\"')}" | xclip -selection clipboard`
      );
    }
    console.log("Content copied to clipboard!");
  } catch (err) {
    console.log("Failed to copy to clipboard. Please copy manually.");
  }
};

// Entry point
const main = async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node extract.js <directory-path>");
    process.exit(1);
  }

  const dirPath = path.resolve(args[0]);
  if (!fs.existsSync(dirPath) || !fs.lstatSync(dirPath).isDirectory()) {
    console.error(`Invalid directory: ${dirPath}`);
    process.exit(1);
  }

  try {
    await extractFiles(dirPath);
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
};

main();
