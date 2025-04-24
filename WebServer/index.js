const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const session = require('express-session'); // Để quản lý trạng thái đăng nhập
const url = require('url');

const app = express();
const port = 3000;

// Middleware xử lý dữ liệu từ form
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Cấu hình session
app.use(session({
  secret: 'secure-session-key', // Thay bằng một chuỗi bí mật an toàn
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }, // Để true nếu sử dụng HTTPS
}));

// Giả lập tài khoản đăng nhập
const user = "admin";
const pass = "admin";

// Biến để lưu mật khẩu
let password = "";  // Mật khẩu mặc định
let mode = "";

// Danh sách client kết nối
let clients = {
  control: [],
  esp32: null,
};

// Route trang login
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/src/login.html');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/src/login.html');
});

// Xử lý đăng nhập
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === user && password === pass) {
    req.session.logged = true; // Lưu trạng thái đăng nhập
    res.redirect('/index');
  } else {
    res.send(`
      <script>
        alert('Tên đăng nhập hoặc mật khẩu không đúng!');
        window.location.href = '/login';
      </script>
    `);
  }
});

// Route chính (yêu cầu đã đăng nhập)
app.get('/index', (req, res) => {
  if (req.session.logged) {
    res.sendFile(__dirname + '/src/index.html');
  } else {
    res.redirect('/login');
  }
});

// Route logout
app.get('/logout', (req, res) => {
  req.session.destroy(); // Xóa session
  res.redirect('/login');
});

// WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws, req) => {
  const query = url.parse(req.url, true).query; // Phân tích URL
  const clientType = query.type;

  console.log(`Client đã kết nối: ${clientType}`);

  // Lưu trữ client
  if (clientType === 'control') {
    clients.control.push(ws);
    ws.send(`Mode: ${mode}`);
    ws.send(`Password: ${password}`);
    console.log(password);
    console.log("Đã gửi mode và password đến client control mới.");

    // Thông báo cho tất cả client control
    clients.control.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send("New control client connected.");
      }
    });
  } else if (clientType === 'esp32') {
    clients.esp32 = ws;
  }

  // Xử lý tin nhắn từ client
  ws.on('message', message => {
    const messageStr = typeof message === 'string' ? message : message.toString();
    console.log(`Dữ liệu từ client (${clientType}): ${messageStr}`);

    if (clientType === 'esp32') {
      // Gửi tin nhắn từ ESP32 đến các client điều khiển
      if (messageStr.startsWith("Password: "))  { 
        const newPassword = messageStr.replace("Password: ", "");
        password = newPassword; // Cập nhật mật khẩu
      } else if (messageStr.startsWith("Mode: ")) {
        const newMode = messageStr.replace("Mode: ", "");
        mode = newMode; // Cập nhật mật khẩu
      } else {
        clients.control.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
            console.log(`Đã gửi "${messageStr}" đến client control`);
          }
        });
      }
    } else if (clientType === 'control' && clients.esp32) {
      // Kiểm tra nếu tin nhắn là yêu cầu thay đổi mật khẩu
      if (messageStr.startsWith("ChangePassword: ")) {
        const newPassword = messageStr.replace("ChangePassword: ", "");
        password = newPassword; // Cập nhật mật khẩu
        console.log(`Mật khẩu đã thay đổi thành: ${password}`);
        clients.esp32.send("Password: " + password);
      }
      else if (messageStr.startsWith("ChangeMode: ")) {
        const newMode = messageStr.replace("ChangeMode: ", "");
        mode = newMode; // Cập nhật mật khẩu
        console.log(`Mode hoạt động: ${mode}`);
        clients.esp32.send("Mode: " + mode);
      }
      else {
        // Gửi tin nhắn từ client điều khiển đến ESP32
        clients.esp32.send(messageStr);
        console.log(`Đã gửi "${messageStr}" đến ESP32`);
      }
    } else {
      console.log(`Không thể xử lý tin nhắn từ client: ${clientType}`);
    }
  });

  // Xử lý khi client ngắt kết nối
  ws.on('close', () => {
    console.log(`${clientType} đã ngắt kết nối.`);
    if (clientType === 'control') {
      clients.control = clients.control.filter(client => client !== ws);
    } else if (clientType === 'esp32') {
      clients.esp32 = null;
    }
  });

  // Gửi phản hồi khi kết nối
  ws.send(`Xin chào ${clientType}!`);
});

// Khởi động HTTP server
app.listen(port, () => {
  console.log(`HTTP server đang chạy tại http://localhost:${port}`);
});
