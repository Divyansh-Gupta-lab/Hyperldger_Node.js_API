'use strict';

const express = require('express');
const mysql = require('mysql');
const md5 = require('md5')
const bodyParser = require('body-parser');
var cors = require('cors')
const moment = require('moment');
const multer = require('multer');
const { intiateAudit } = require('./initiateAudit.js')
const { updateAudit } = require('./updateAudit.js')
const jwt = require('jsonwebtoken');
const { fetchAudit } = require('./fetchAudit.js')
const { fetchAuditHistory } = require('./fetchAuditHistory.js')
const { fetchAllAudit } = require('./fetchAllAudit.js')
const ipfsService = require("./ipfs.js");
const path = require('path')
const fs = require('fs');
const { log } = require('console');
const uuid = require("short-uuid");

const app = express();
app.use(cors())
app.use(express.json());
app.use(bodyParser.json());
app.use('/files', express.static('upload/images'));
const secretKey = 'eyJhbGciOiJIUzI1NiJ9.eyJJc3N1ZXIiOiJJc3N1ZXIifQ.HLkw6rgYSwcv0sE69OKiNQFvHoo-6VqlxC5nKuMmftg';
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server Listening on PORT:", PORT);
});


const connection = mysql.createConnection({
  host: 'localhost',     // MySQL server host
  user: 'root', // MySQL username
  password: 'admin@123', // MySQL password
  database: 'audit' // Name of your database
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.stack);
    return;
  }
  console.log('Connected to MySQL as id', connection.threadId);
});

function JWTVerify(req, res) {
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) {
    res.status(401).json({ message: 'Token missing' });
    return false
  }
  try {
    const decoded = jwt.verify(token, secretKey);
    // If verification succeeds, the token is authorized
    return decoded;
  } catch (error) {
    // If verification fails, the token is not authorized
    res.status(401).json({ message: 'Authentication failed' });
    return false;
  }
}

app.post('/login', (req, res) => {
  const { email_id, password, id_type } = req.body;
  let username = email_id;
  const missingFields = [];
  if (!email_id) {
    missingFields.push('email_id');
  }

  if (!password) {
    missingFields.push('password');
  }

  if (!id_type) {
    missingFields.push('id_type');
  }

  if (missingFields.length > 0) {
    let errorMessage = `Missing required field${missingFields.length > 1 ? 's' : ''}: `;
    errorMessage += missingFields.join(', ');

    return res.status(400).json({ error: errorMessage });
  }
  // Check if username already exists
  const checkQuery = 'SELECT password FROM user WHERE username = ?';
  connection.query(checkQuery, [username], (error, results) => {
    if (error) {
      console.error('Error checking username:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!(results.length > 0)) {
      return res.status(400).json({ error: 'Username doesnt exists' });
    }
    const hashPassword = md5(password)
    const storedPassword = results[0].password;
    if (storedPassword != hashPassword) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    const checkQuery = 'SELECT id_type FROM user WHERE username = ?';
    connection.query(checkQuery, [username], async (error, results) => {
      if (error) {
        console.error('I have no idea:', error);
        return res.status(500).json({ error: 'Database error' });
      }

      const storedid_type = results[0].id_type;
      if (storedid_type != id_type) {
        return res.status(400).json({ error: 'Invalid Credentials' });
      }
      const token = jwt.sign({ sub: { username, storedid_type } }, secretKey, { expiresIn: '1h' });
      res.json({ message: 'Successfully logged in', ID_type: storedid_type, token: token })
    });
  });
});


app.post('/signup', (req, res) => {
  const { email_id, password, id_type } = req.body;
  let username = email_id;
  const missingFields = [];
  if (!email_id) {
    missingFields.push('email_id');
  }

  if (!password) {
    missingFields.push('password');
  }

  if (!id_type) {
    missingFields.push('id_type');
  }

  if (missingFields.length > 0) {
    let errorMessage = `Missing required field${missingFields.length > 1 ? 's' : ''}: `;
    errorMessage += missingFields.join(', ');

    return res.status(400).json({ error: errorMessage });
  }
  // Check if username already exists
  if (id_type == 'admin') {
    const decoded = JWTVerify(req, res)
    if (!decoded) {
      return;
    }
    const { storedid_type } = decoded.sub;
    if (storedid_type != 'super_admin') {
      return res.status(401).json({ message: 'This identity is not allowed to register admins' });
    }
  }
  if (id_type == 'auditor') {
    const decoded = JWTVerify(req, res)
    if (!decoded) {
      return;
    }
    const { storedid_type } = decoded.sub;
    if (storedid_type != 'admin') {
      return res.status(401).json({ message: 'This identity is not allowed to register auditors' });
    }
  }
  const checkQuery = 'SELECT * FROM user WHERE username = ?';
  connection.query(checkQuery, [username], (error, results) => {
    if (error) {
      console.error('Error checking username:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Insert new user
    const hashPassword = md5(password)
    const insertQuery = 'INSERT INTO user (username, password, id_type) VALUES (?, ?, ?)';
    connection.query(insertQuery, [username, hashPassword, id_type], (insertError) => {
      if (insertError) {
        console.error('Error inserting identity:', insertError);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Signup successful' });
    });
  });
});

app.post('/CreateAudit', async (req, res) => {
  try {
    const decoded = JWTVerify(req, res)
    if (!decoded) {
      return;
    }
  const missingFields = [];
  if (!req.body.auditType) {
    missingFields.push('auditType');
  }
  if (!req.body.reason) {
    missingFields.push('reason');
  }
  if (!req.body.tenure) {
    missingFields.push('tenure');
  }
  if (!req.body.auditDate) {
    missingFields.push('auditDate');
  }
  if (!req.body.status) {
    missingFields.push('status');
  }
  if (missingFields.length > 0) {
    let errorMessage = `Missing required field${missingFields.length > 1 ? 's' : ''}: `;
    errorMessage += missingFields.join(', ');

    return res.status(400).json({ error: errorMessage });
  }
    const { username, storedid_type } = decoded.sub;
    if (storedid_type != 'auditor') {
      return res.status(401).json({ message: 'This user is not allowed to perform this function' });
    }
    const Audit_ID = uuid.generate()
    const result = await intiateAudit("newbie", Audit_ID, username, req.body.auditType, req.body.reason, req.body.tenure, req.body.auditDate, req.body.status);
    // Process auditData here
    // ...
    res.json({ message: "New audit created", AuditID: Audit_ID, Blockchain_Transaction_ID: result });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'An error occurred' });
  }
}
);
const storage = multer.diskStorage({
  destination: './upload/images',
  filename: (req, file, cb) => {
    return cb(
      null,
      `${file.originalname}_${Date.now()}${path.extname(file.originalname)}`
    );
  },
});
const upload = multer({ storage: storage });


app.post('/UpdateAudit', upload.single('file'), async (req, res) => {
  try {
    const decoded = JWTVerify(req, res)
    if (!decoded) {
      return;
    }
    const { username, storedid_type } = decoded.sub;
    if (storedid_type != 'auditor') {
      return res.status(401).json({ message: 'This user is not allowed to perform this function' });
    }
    const fileBuffer = Buffer.from(fs.readFileSync(req.file.path))
    const fileHash = await ipfsService.upload(fileBuffer)
    
    const fileData = {}
    fileData.fileHash = fileHash
    fileData.fileName = req.file.filename;
    const lastDotIndex = fileData.fileName.lastIndexOf('.');
    if (lastDotIndex !== -1 && lastDotIndex < fileData.fileName.length - 1) {
      fileData.fileName = fileData.fileName.substring(lastDotIndex + 1);
    }
    console.log(fileData.fileName);
    const result = await updateAudit("newbie", req.body.audit_id, username, JSON.stringify(fileData));
    res.json({ message: "Audit updated successfully", AuditID: req.body.audit_id, Blockchain_Transaction_ID: result });
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: 'An error occurred' });
  }
});

app.get('/FetchAudit', async (req, res) => {
  try {
    // const decoded = JWTVerify(req, res)
    // if (!decoded) {
    //   return;
    // }
    if (!req.query.audit_id){
      return res.json({error : 'No Audit ID provided'})
    }
    const result = await fetchAudit("newbie", req.query.audit_id);
    const { auditFileHash } = JSON.parse(result);
    if (auditFileHash.length > 0) {
      try {
        const filePathArray = []
       
          for(let i=0;i<auditFileHash.length;i++){
          const fileHash = (JSON.parse(auditFileHash[i])).fileHash
          const fileName = (JSON.parse(auditFileHash[i])).fileName
          const tempPath = path.join(
            __dirname, "upload/images/", `${fileHash}.${fileName}`
          );
          filePathArray.push(`files/${fileHash}.${fileName}`)
          const fileByteArray = await ipfsService.fetch(fileHash);
          const writeStream = fs.createWriteStream(tempPath);
          writeStream.write(fileByteArray);
          writeStream.close();
        }
        const finalData = {
          ...JSON.parse(result),
          filePath: filePathArray
        }
       return res.json({ Audit_Data: finalData });

      } catch (error) {
        console.error('Error fetching audit file data:', error);
      }
    }
    else{
      return res.json({ Audit_Data: JSON.parse(result)})
    }

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: 'An error occurred' });
  }
});


app.get('/FetchAllAudit', async (req, res) => {
  try {
    const decoded = JWTVerify(req, res)
    if (!decoded) {
      return;
    }
    const { username, storedid_type } = decoded.sub;

    if (storedid_type == 'user' || storedid_type == 'auditor') {
      return res.status(401).json({ message: 'This user is not allowed to perform this function' });
    }
    const result = await fetchAllAudit("newbie");
    const allFinalDataArray = [];
    // Process auditData here
    const allAuditData = JSON.parse(result);
    for (const auditData of allAuditData) {
      const { auditFileHash, ...restData } = auditData;
      if (auditFileHash.length > 0) {
        try {
          const filePathArray = []
          let count = 1
          for (let i=0;i<auditFileHash.length;i++) {
            const fileHash = (JSON.parse(auditFileHash[i])).fileHash
            const fileName = (JSON.parse(auditFileHash[i])).fileName
            const tempPath = path.join(
              __dirname, "upload/images/", `${fileHash}.${fileName}`
            );
            filePathArray.push(`files/${fileHash}.${fileName}`)
            const fileByteArray = await ipfsService.fetch(fileHash);
            const writeStream = fs.createWriteStream(tempPath);
            writeStream.write(fileByteArray);
            writeStream.close();
            count++
          }
          auditData.filePath = filePathArray;
          allFinalDataArray.push(auditData);
        } catch (error) {
          console.error('Error fetching audit file data:', error);
        }
      }
      else {
        const filePathArray = []
        auditData.filePath = filePathArray;
        allFinalDataArray.push(auditData);
      }
    }
    res.json({ All_Audit_Data: allFinalDataArray });
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: 'An error occurred' });
  }
}
);

app.get('/FetchAuditHistory', async (req, res) => {
  try {
    // const decoded = JWTVerify(req, res)
    // if (!decoded) {
    //   return;
    // }
    if (!req.query.audit_id){
      return res.json({error : 'No Audit ID provided'})
    }
    const result = await fetchAuditHistory("newbie", req.query.audit_id);
    // Process auditData here
    const parsedData = []
    const allAuditData = JSON.parse(result)
    for (const auditData of allAuditData) {
      const data = JSON.parse(auditData)
      parsedData.push(data)
    }
    const allFinalDataArray = [];
    for (const auditData of parsedData) {
      const { auditFileHash, ...restData } = auditData;
      if (auditFileHash.length > 0) {
        try {
          const filePathArray = []
          let count = 1
          for (let i=0;i<auditFileHash.length;i++) {
            const fileHash = (JSON.parse(auditFileHash[i])).fileHash
            const fileName = (JSON.parse(auditFileHash[i])).fileName
            const tempPath = path.join(
              __dirname, "upload/images/", `${fileHash}.${fileName}`
            );
            filePathArray.push(`files/${fileHash}.${fileName}`)
            const fileByteArray = await ipfsService.fetch(fileHash);
            const writeStream = fs.createWriteStream(tempPath);
            writeStream.write(fileByteArray);
            writeStream.close();
            count++
          }
          auditData.filePath = filePathArray;
          allFinalDataArray.push(auditData);
        } catch (error) {
          console.error('Error fetching audit file data:', error);
        }
      }
      else {
        const filePathArray = []
        auditData.filePath = filePathArray;
        allFinalDataArray.push(auditData);
      }
    }
    res.json({ Audit_History: allFinalDataArray });
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: 'audit does not exists' });
  }
}
);

app.get('/FetchAuditPreview', async (req, res) => {
  try {
    // const decoded = JWTVerify(req, res)
    // if (!decoded) {
    //   return;
    // }
    const result = await fetchAuditHistory("newbie", req.query.audit_id);
    // Process auditData here
    const parsedData = []
    const allAuditData = JSON.parse(result)
    for (const auditData of allAuditData) {
      const data = JSON.parse(auditData)
      parsedData.push(data)
    }
    const allFinalDataArray = [];
    for (const auditData of parsedData) {
      const { auditFileHash, ...restData } = auditData;
      if (auditFileHash.length > 0) {
        try {
          const filePathArray = []
          let count = 1
          for (let i=0;i<auditFileHash.length;i++) {
            const fileHash = (JSON.parse(auditFileHash[i])).fileHash
            const fileName = (JSON.parse(auditFileHash[i])).fileName
            const tempPath = path.join(
              __dirname, "upload/images/", `${fileHash}.${fileName}`
            );
            filePathArray.push(`files/${fileHash}.${fileName}`)
            const fileByteArray = await ipfsService.fetch(fileHash);
            const writeStream = fs.createWriteStream(tempPath);
            writeStream.write(fileByteArray);
            writeStream.close();
            count++
          }
          auditData.filePath = filePathArray;
          allFinalDataArray.push(auditData);
        } catch (error) {
          console.error('Error fetching audit file data:', error);
        }
      }
      // else {
      //   const filePathArray = []
      //   auditData.filePath = filePathArray;
      //   allFinalDataArray.push(auditData);
      // }
    }
    res.json({ Audit_History: allFinalDataArray });
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: 'An error occurred' });
  }
}
);

// app.get('/FetchCurrentAudit', async (req, res) => {
//   try {
//     const decoded = JWTVerify(req, res)
//     if (!decoded) {
//       return;
//     }
//     const result = await fetchAllAudit("newbie");
//     const allFinalDataArray = [];
//     // Process auditData here
//     const allAuditData = JSON.parse(result);
//     for (const auditData of allAuditData) {
//       const { auditFileHash, ...restData } = auditData;
//       if (auditFileHash.length > 0) {
//         try {   
//           const filePathArray = []    
//           let count = 1
//           for (let hashValue of auditFileHash) {

//             const tempPath = path.join(
//               __dirname, "upload/images/", `${hashValue}-${count}.jpg`

//             );
//             filePathArray.push(`files/${hashValue}-${count}.jpg`)
//             const fileByteArray = await ipfsService.fetch(hashValue);
//             const writeStream = fs.createWriteStream(tempPath);
//             writeStream.write(fileByteArray);
//             writeStream.close();
//             count++
//           }
//           auditData.filePath = filePathArray;
//           allFinalDataArray.push(auditData);
//         } catch (error) {
//           console.error('Error fetching audit file data:', error);
//         }
//       }
//       else {
//         const filePathArray = []  
//         auditData.filePath = filePathArray;
//         allFinalDataArray.push(auditData);
//       }
//     }
//     const today = new Date();
//     const options = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' };
//     const formattedToday = today.toLocaleDateString('en-IN', options);
//     const currentAuditData = allFinalDataArray.filter(item => moment.unix(item.createdAt).format("DD/MM/YYYY") === formattedToday);
//     res.json({ All_Audit_Data: currentAuditData });
//   } catch (error) {
//     console.error('Error:', error.message);
//     res.status(500).json({ error: 'An error occurred' });
//   }
// }
// );

