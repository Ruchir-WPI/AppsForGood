const express = require('express');
const app = express();

const PORT = 2000;


app.get('/', (req, res) => {
  res.send('Apps for Good!');
});

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
