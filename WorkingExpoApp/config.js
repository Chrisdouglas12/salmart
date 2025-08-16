const isLocalhost = __DEV__; 
// __DEV__ is true when running in development (on emulator/device via Expo or Metro)

const API_BASE_URL = isLocalhost
  ? "http://10.0.2.2:3000" 
  : "https://salmart.onrender.com";

export default API_BASE_URL;