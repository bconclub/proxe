'use client'

import { useState, useEffect } from 'react';
import type { BrandConfig } from '@/configs';
import { storeUserProfile, getStoredUser } from '@/lib/chatLocalStorage';
import styles from './ChatWidget.module.css';

interface DeployFormInlineProps {
  brand: string;
  config: BrandConfig;
  userProfile: {
    name?: string;
    email?: string;
    phone?: string;
    websiteUrl?: string;
  };
  onContactDraft?: (data: { name?: string; email?: string; phone?: string; websiteUrl?: string }) => void;
  onContactSubmit?: (data: { name?: string; email?: string; phone?: string; websiteUrl?: string }) => void | Promise<void>;
  onFormSubmit?: () => void;
}

export function DeployFormInline({
  brand,
  config,
  userProfile,
  onContactDraft,
  onContactSubmit,
  onFormSubmit,
}: DeployFormInlineProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    websiteUrl: '',
  });

  // Helper to clean phone number (remove +1 prefix if present)
  const cleanPhoneNumber = (phone: string | null | undefined): string => {
    if (!phone) return '';
    // Remove +1 prefix if present
    return phone.replace(/^\+1\s*/, '').trim();
  };

  // Pre-fill form with existing user data
  useEffect(() => {
    const existingUser = getStoredUser('proxe');
    if (existingUser) {
      setFormData({
        name: existingUser.name || userProfile.name || '',
        email: existingUser.email || userProfile.email || '',
        phoneNumber: cleanPhoneNumber(existingUser.phone || userProfile.phone),
        websiteUrl: existingUser.websiteUrl || userProfile.websiteUrl || '',
      });
    } else {
      setFormData({
        name: userProfile.name || '',
        email: userProfile.email || '',
        phoneNumber: cleanPhoneNumber(userProfile.phone),
        websiteUrl: userProfile.websiteUrl || '',
      });
    }
  }, [userProfile, brand]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    // Notify parent of draft changes
    if (onContactDraft) {
      onContactDraft({
        name: name === 'name' ? value : formData.name,
        email: name === 'email' ? value : formData.email,
        phone: name === 'phoneNumber' ? value : formData.phoneNumber,
        websiteUrl: name === 'websiteUrl' ? value : formData.websiteUrl,
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required';
    }

    if (!formData.websiteUrl.trim()) {
      newErrors.websiteUrl = 'Website URL is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('Form submitted:', formData);

    // Save user details to profile
    const userProfileData = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phoneNumber.trim(),
      websiteUrl: formData.websiteUrl.trim(),
      promptedName: true,
      promptedEmail: true,
      promptedPhone: true,
    };

    // Store for the brand
    storeUserProfile(userProfileData, 'proxe');

    // Notify parent of contact submission
    if (onContactSubmit) {
      await onContactSubmit(userProfileData);
    }

    setIsSubmitting(false);
    setSubmitSuccess(true);

    // Notify parent about successful submission
    if (onFormSubmit) {
      setTimeout(() => {
        onFormSubmit();
      }, 2000);
    }
  };

  if (submitSuccess) {
    return (
      <div className={styles.deploySuccessMessage}>
        <div className={styles.deploySuccessIcon}>✓</div>
        <h3 className={styles.deploySuccessTitle}>Successfully Submitted!</h3>
        <p className={styles.deploySuccessText}>We'll be in touch with you shortly to set up your PROXe.</p>
      </div>
    );
  }

  return (
    <div className={styles.deployFormContainer}>
      <h3 className={styles.deployFormTitle}>Deploy PROXe</h3>
      <form onSubmit={handleSubmit} className={styles.deployForm}>
        <div className={styles.deployFormGroup}>
          <label htmlFor="deploy-name" className={styles.deployLabel}>
            Name <span className={styles.deployRequired}>*</span>
          </label>
          <input
            type="text"
            id="deploy-name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={`${styles.deployInput} ${errors.name ? styles.deployInputError : ''}`}
            placeholder="Your full name"
          />
          {errors.name && <span className={styles.deployErrorText}>{errors.name}</span>}
        </div>

        <div className={styles.deployFormGroup}>
          <label htmlFor="deploy-email" className={styles.deployLabel}>
            Email <span className={styles.deployRequired}>*</span>
          </label>
          <input
            type="email"
            id="deploy-email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={`${styles.deployInput} ${errors.email ? styles.deployInputError : ''}`}
            placeholder="your@email.com"
          />
          {errors.email && <span className={styles.deployErrorText}>{errors.email}</span>}
        </div>

        <div className={styles.deployFormGroup}>
          <label htmlFor="deploy-phone" className={styles.deployLabel}>
            Phone Number <span className={styles.deployRequired}>*</span>
          </label>
          <input
            type="tel"
            id="deploy-phone"
            name="phoneNumber"
            value={formData.phoneNumber}
            onChange={handleChange}
            className={`${styles.deployInput} ${errors.phoneNumber ? styles.deployInputError : ''}`}
            placeholder="Enter your phone number"
          />
          {errors.phoneNumber && <span className={styles.deployErrorText}>{errors.phoneNumber}</span>}
        </div>

        <div className={styles.deployFormGroup}>
          <label htmlFor="deploy-website" className={styles.deployLabel}>
            Website URL <span className={styles.deployRequired}>*</span>
          </label>
          <input
            type="text"
            id="deploy-website"
            name="websiteUrl"
            value={formData.websiteUrl}
            onChange={handleChange}
            className={`${styles.deployInput} ${errors.websiteUrl ? styles.deployInputError : ''}`}
            placeholder="yourwebsite.com"
          />
          {errors.websiteUrl && <span className={styles.deployErrorText}>{errors.websiteUrl}</span>}
        </div>

        <button
          type="submit"
          className={styles.deploySubmitButton}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Deploy Now'}
        </button>
      </form>
    </div>
  );
}
