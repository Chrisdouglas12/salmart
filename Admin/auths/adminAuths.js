const express = require('express')
const bcrypt = require('bcryptjs')
const Admin = require('./adminRegister.js')
const jwt = require('jsonwebtoken')
const app = express()

//
app.post('/registerAdmin', async (req, res)=>{
  try{
    const {email, password} = req.body;
    //check if user exist
    const existingAdmin = await Admin.findOne({email})
    if(existingAdmin) {
     return res.status(400).json({message: 'This email is already in use, try another'})
    }
    //hash password
    const hashPassword = await bcrypt.hash(password, 10);
    //create admin 
    const newAdmin = new Admin({email, password: hashPassword})
    //save admin
    await newAdmin.save()
    res.status(201).json({message: 'Admin created successfully'})
  }catch(error){
    console.error(error)
    res.status(500).json({message: 'Server error'})
  }
})

//Admin login
app.post('/adminLogin', async (req, res)=>{
  try{
    const {email, password} = req.body;
    //check if admin exist
    const admin = await Admin.findOne({email})
    if(!admin) {
      return res.status(404).json({message: 'User not found'})
    }
    //Validate password
    const IsPassword = await bcrypt.compare(password, admin.password)
    if(!IsPassword) {
      return res.status(404).json({message: 'Invalid password'})
    }
    const token = jwt.sign({ adminId: admin._id}, 'hhhdhdhhdskeudnd', {expiresIn: '1w'})
    res.status(201).json({message: 'Login successful',
      token: token, 
      admin: {
        adminId: admin._Id,
        email: admin.email,
      }
    })
  }catch(error){
    console.error(error)
    res.status(500).json({message: 'Server error'})
  }
  
})

//get profile info
app.get('/getAdminProfile/:adminId', async (req, res) => {
  const adminId = req.params
  try{
    const admin = await Admin.findById({adminId})
    if(!admin) {
      return res.status(404).json({message: 'Admin not found'})
    }
    res.json({
      email: admin.email,
      profilePic: admin.profilePic,
      id: admin.id
    })
  }catch(error) {
    console.error(error)
    res.status(500).json({message: 'Server error'})
  }
})