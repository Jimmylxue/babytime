import { View, Text, Input, Picker, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState, useMemo, useRef } from 'react';
import { useBabyStore } from '../../stores/babyStore';
import { chooseAndUploadImage } from '../../utils/upload';
import { markAutoRedirectedToOnboarding } from '../../utils/onboarding';
import babyFacePink from '../../assets/icons/baby-face-pink.svg';
import babyFaceBlue from '../../assets/icons/baby-face-blue.svg';
import './index.scss';

/**
 * 新用户引导页：建宝宝档案 → 引导记录第一条 → 进入首页
 * 登录后无宝宝时自动进入；已创建过宝宝再回到本页时自动回首页
 */
export default function OnboardingPage() {
  const { addBaby } = useBabyStore();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [birthday, setBirthday] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const createdRef = useRef(false);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  useDidShow(() => {
    // 从记录页返回：宝宝已创建，直接进首页
    if (createdRef.current) {
      Taro.switchTab({ url: '/pages/index/index' });
    }
  });

  const handleChooseAvatar = async () => {
    const imageUrl = await chooseAndUploadImage();
    if (imageUrl) {
      setAvatar(imageUrl);
    }
  };

  const handleSkip = () => {
    // 用户主动跳过后，本次启动不再自动跳回引导页
    markAutoRedirectedToOnboarding()
    Taro.switchTab({ url: '/pages/index/index' });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Taro.showToast({ title: '请输入宝贝名字', icon: 'none' });
      return;
    }
    if (!birthday) {
      Taro.showToast({ title: '请选择出生日期', icon: 'none' });
      return;
    }
    if (birthday > today) {
      Taro.showToast({ title: '出生日期不能晚于今天', icon: 'none' });
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const baby = await addBaby({
        name: name.trim(),
        gender,
        birthday,
        avatar,
      });
      createdRef.current = true;
      const res = await Taro.showModal({
        title: '宝宝档案建好啦 🎉',
        content: '现在记录第一条吗？比如一次喂奶或换尿布',
        confirmText: '记一笔',
        cancelText: '稍后再说',
      });
      if (res.confirm) {
        Taro.navigateTo({
          url: `/pages/record/index?type=feeding&babyId=${baby.id}`,
        });
      } else {
        Taro.switchTab({ url: '/pages/index/index' });
      }
    } catch (error) {
      Taro.showToast({ title: '创建失败，请重试', icon: 'none' });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const onDateChange = (e) => {
    setBirthday(e.detail.value);
  };

  return (
    <View className="onboarding-page">
      {/* 欢迎 */}
      <View className="ob-hero">
        <View className="ob-hero-icon">
          <Image className="ob-hero-icon-img" src={babyFacePink} />
        </View>
        <Text className="ob-hero-title">欢迎来到育娃手记</Text>
        <Text className="ob-hero-desc">
          先为宝宝建立专属档案，就能开始记录啦
        </Text>
        <View className="ob-steps">
          <View className="ob-step">
            <Text className="ob-step-num">1</Text>
            <Text className="ob-step-text">建档案</Text>
          </View>
          <Text className="ob-step-arrow">→</Text>
          <View className="ob-step">
            <Text className="ob-step-num">2</Text>
            <Text className="ob-step-text">记日常</Text>
          </View>
          <Text className="ob-step-arrow">→</Text>
          <View className="ob-step">
            <Text className="ob-step-num">3</Text>
            <Text className="ob-step-text">看成长</Text>
          </View>
        </View>
      </View>

      {/* 表单 */}
      <View className="ob-form-card">
        <View className="ob-avatar-section" onClick={handleChooseAvatar}>
          <View className="ob-avatar-wrapper">
            {avatar ? (
              <Image className="ob-avatar-img" src={avatar} mode="aspectFill" />
            ) : (
              <View className={`ob-avatar-placeholder ${gender}`}>
                <Image
                  className="ob-avatar-icon-img"
                  src={gender === 'male' ? babyFaceBlue : babyFacePink}
                />
              </View>
            )}
            <View className="ob-avatar-badge">
              <Text className="ob-badge-icon">📷</Text>
            </View>
          </View>
          <Text className="ob-avatar-tip">点击设置头像（可跳过）</Text>
        </View>

        <View className="ob-form-group">
          <Text className="ob-form-label">宝贝名字</Text>
          <Input
            className="ob-form-input"
            placeholder="宝宝的小名或昵称"
            value={name}
            maxlength={20}
            onInput={(e) => setName(e.detail.value)}
          />
        </View>

        <View className="ob-form-group">
          <Text className="ob-form-label">性别</Text>
          <View className="ob-gender-select">
            <View
              className={`ob-gender-option ${gender === 'male' ? 'active' : ''}`}
              onClick={() => setGender('male')}
            >
              <Image className="ob-gender-icon-img" src={babyFaceBlue} />
              <Text>男宝</Text>
            </View>
            <View
              className={`ob-gender-option ${gender === 'female' ? 'active' : ''}`}
              onClick={() => setGender('female')}
            >
              <Image className="ob-gender-icon-img" src={babyFacePink} />
              <Text>女宝</Text>
            </View>
          </View>
        </View>

        <View className="ob-form-group">
          <Text className="ob-form-label">出生日期</Text>
          <Picker mode="date" end={today} onChange={onDateChange} value={birthday || today}>
            <View className="ob-form-input ob-date-picker">
              <Text className={birthday ? '' : 'ob-placeholder'}>
                {birthday || '请选择出生日期'}
              </Text>
              <Text className="ob-date-arrow">›</Text>
            </View>
          </Picker>
        </View>
      </View>

      {/* 提交 */}
      <View
        className={`ob-submit-btn ${loading ? 'ob-submit-loading' : ''}`}
        onClick={handleSubmit}
      >
        <Text className="ob-submit-text">{loading ? '创建中...' : '创建宝宝档案'}</Text>
      </View>
      <View className="ob-skip" onClick={handleSkip}>
        <Text className="ob-skip-text">跳过，先随便逛逛</Text>
      </View>
    </View>
  );
}
