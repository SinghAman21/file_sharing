import { NextRequest, NextResponse } from 'next/server';
import { databases, storage, ID, DATABASE_ID, COLLECTIONS, BUCKETS } from '@/lib/appwrite';
import { fileUploadRateLimiter } from '@/lib/middleware/rateLimiter';
import { generateId, generateSecureId, validateFileType, validateFileSize, getClientIP, getAllowedTypes } from '@/lib/security';
import { supabaseAdmin } from '@/lib/supabase';
import redis, { REDIS_KEYS, setWithExpiry } from '@/lib/redis';
import { virusScanner } from '@/lib/virusScanner';
import { logger } from '@/lib/logger';
import FormData from 'form-data';
import fetch from 'node-fetch';

export async function POST(request: NextRequest) {
  // Check environment configuration
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || 
      process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co' ||
      !process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
      process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT === 'https://placeholder.appwrite.io/v1') {
    return NextResponse.json(
      { error: 'Service not properly configured' },
      { status: 503 }
    );
  }

  try {
    // Rate limiting
    const rateLimitResult = await fileUploadRateLimiter.isAllowed(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many upload attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const password = formData.get('password') as string;
    const expiresIn = formData.get('expiresIn') as string;
    const maxDownloads = formData.get('maxDownloads') as string;
    const captchaToken = formData.get('captchaToken') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Verify CAPTCHA   //check : for development purpose its turned off, switch on for production
    // if (!captchaToken) {
    //   return NextResponse.json(
    //     { error: 'CAPTCHA verification required' },
    //     { status: 400 }
    //   );
    // }

    // const captchaResponse = await fetch('https://hcaptcha.com/siteverify', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    //   body: `secret=${process.env.HCAPTCHA_SECRET_KEY}&response=${captchaToken}`
    // });

    // const captchaData = await captchaResponse.json();
    // if (!captchaData.success) {
    //   return NextResponse.json(
    //     { error: 'CAPTCHA verification failed' },
    //     { status: 400 }
    //   );
    // }

    // Validate file
        // Validate file type and size
        const allowedTypes = getAllowedTypes();
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '104857600');
    if (!validateFileType(file.name, file.type, allowedTypes)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      );
    }
    if (!validateFileSize(file.size, maxSize)) {
      return NextResponse.json(
        { error: 'File size exceeds limit' },
        { status: 400 }
      );
    }

    // Generate IDs
    const fileId = generateId();
    const downloadToken = generateSecureId();
    const editToken = generateSecureId();

    // Convert file to buffer for virus scanning and upload
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Virus scanning
    const scanResult = await virusScanner.scanBuffer(fileBuffer);
    if (!scanResult.isClean) {
      // Log security event
      await supabaseAdmin.from('audit_logs').insert({
        action: 'virus_detected',
        resource_type: 'file',
        resource_id: fileId,
        ip_address: getClientIP(request),
        user_agent: request.headers.get('user-agent'),
        metadata: {
          filename: file.name,
          signature: scanResult.signature,
          message: scanResult.message
        }
      });
      return NextResponse.json(
        { error: 'File contains malicious content and cannot be uploaded' },
        { status: 400 }
      );
    }

    // Determine bucket ID from env or fallback
    // const bucketId = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_KEY || BUCKETS.FILES;

    // Upload file to Appwrite Storage using REST API (form-data)
    const form = new FormData();
    form.append('fileId', fileId);
    form.append('file', fileBuffer, { filename: file.name, contentType: file.type });

    // const res = await fetch(`${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files`, {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${BUCKETS.FILES}/files`, {
      method: 'POST',
      headers: {
        'X-Appwrite-Project': process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ?? '',
        'X-Appwrite-Key': process.env.APPWRITE_API_KEY ?? '', // Must be a server API key
        ...form.getHeaders()
      },
      body: form
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Appwrite upload failed:', errText);
      return NextResponse.json(
        { error: 'Appwrite upload failed', details: errText },
        { status: 500 }
      );
    }
    const uploadedFile = await res.json();

    // Calculate expiry
    let expiryDate = null;
    if (expiresIn && expiresIn !== 'never') {
      const hours = parseInt(expiresIn);
      expiryDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }

    // Store file metadata in Supabase
    const { data: fileRecord, error: fileInsertError } = await supabaseAdmin.from('files').insert([
      {
        original_name: file.name,
        size: file.size,
        mime_type: file.type,
        download_token: downloadToken,
        edit_token: editToken,
        password: password || null,
        expiry_date: expiryDate,
        max_downloads: maxDownloads ? parseInt(maxDownloads) : null,
        download_count: 0,
        is_active: true,
        uploaded_at: new Date().toISOString(),
        uploaded_by: getClientIP(request),
        last_downloaded_at: null
      }
    ]);
    if (fileInsertError) {
      console.error('Supabase file insert error:', fileInsertError);
      return NextResponse.json(
        { error: 'Failed to save file metadata in Supabase', details: fileInsertError.message },
        { status: 500 }
      );
    }

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      action: 'file_upload',
      resource_type: 'file',
      resource_id: fileId,
      ip_address: getClientIP(request),
      user_agent: request.headers.get('user-agent'),
      metadata: {
        filename: file.name,
        size: file.size,
        mimeType: file.type
      }
    });

    // Store tokens in Redis for quick access
    await setWithExpiry(
      REDIS_KEYS.FILE_UPLOAD(downloadToken),
      JSON.stringify({ fileId, editToken }),
      24 * 60 * 60 // 24 hours
    );

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    const downloadUrl = `${baseUrl}/files/${downloadToken}`;
    const editUrl = `${baseUrl}/files/manage/${editToken}`;

    return NextResponse.json({
      success: true,
      fileId,
      downloadUrl,
      editUrl,
      file: {
        name: file.name,
        size: file.size,
        type: file.type
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }
}
