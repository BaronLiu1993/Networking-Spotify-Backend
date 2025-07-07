import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const encryptionAlgorithm = process.env.ENCRYPTION_ALGORITHM || "aes-256-gcm";
const salt = process.env.ENCRYPTION_SALT;
const secret = process.env.ENCRYPTION_SECRET;

export async function encryptToken(token) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 32, (err, key) => {
      if (err) return reject(err);

      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(encryptionAlgorithm, key, iv);

      let encrypted = cipher.update(token, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag();

      const encryptedData = {
        iv: iv.toString("hex"),
        tag: authTag.toString("hex"),
        encrypted,
      };

      const result = JSON.stringify(encryptedData);
      resolve(result);
    });
  });
}

export async function decryptToken(encryptedString) {
  let encryptedData;
  encryptedData = JSON.parse(encryptedString);

  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 32, (err, key) => {
      try {
        const iv = Buffer.from(encryptedData.iv, "hex");
        const tag = Buffer.from(encryptedData.tag, "hex");

        const decipher = crypto.createDecipheriv(encryptionAlgorithm, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");
        resolve(decrypted);
      } catch {
        reject();
      }
    });
  });
}
