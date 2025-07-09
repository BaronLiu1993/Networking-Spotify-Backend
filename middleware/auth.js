import { supabase } from "../supabase/supabase.js";

export async function verifyToken(req, res, next) {
    try {
      const authHeader = req.headers["authorization"];
      if (!authHeader) {
        return res
          .status(401)
          .json({ message: "Missing Authorization header", success: false });
      }
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Missing token", success: false });
      }
      const { data, error } = await supabase.auth.getUser(token);
  
      if (error || !data.user) {
        return res
          .status(401)
          .json({ message: "Invalid or expired token", success: false });
      }
  
      //Only Send Back ID
      req.user = data.user.id;
      next();
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized", success: false });
    }
  }
  