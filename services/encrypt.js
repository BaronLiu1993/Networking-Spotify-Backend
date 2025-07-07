import crypto from "crypto";
import dotenv from "dotenv"

dotenv.config()
const encryptionAlgorithm = process.env.encryptionAlgorithm;
const salt = process.env.encryptionSalt; 

export async function encryptToken(token) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(token, salt, 32, (err, key) => {
      if (err) return reject(err);

      const iv = crypto.randomBytes(12); 
      const cipher = crypto.createCipheriv(encryptionAlgorithm, key, iv);

      let encrypted = cipher.update(token, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag();

      const encryptedData = {
        iv: iv.toString("hex"),
        encrypted,
        tag: authTag.toString("hex"),
      };

      resolve(encryptedData);
    });
  });
}

export async function decryptToken(encryptedData, token) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(token, salt, 32, (err, key) => {
      if (err) return reject(err);

      const iv = Buffer.from(encryptedData.iv, "hex");
      const tag = Buffer.from(encryptedData.tag, "hex");
      const decipher = crypto.createDecipheriv(encryptionAlgorithm, key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      resolve(decrypted);
    });
  });
}
