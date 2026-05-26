# 磁通量

## 定义

通过曲面 S 的磁通量定义为
$$ \Phi_B = \int_S \vec B \cdot d\vec A $$
其中 $\vec B$ 是磁感应强度，$d\vec A$ 是面元矢量，方向沿曲面单位法线。SI 单位为韦伯（Wb），$1\,\text{Wb} = 1\,\text{T}\cdot\text{m}^2$。

对于均匀磁场穿过平面回路：
$$ \Phi_B = B A \cos\theta $$
其中 $\theta$ 是磁场方向与回路法线的夹角。

## 三个变化来源

磁通量随时间变化可由三类原因引起：

1. **磁场强度变化** $dB/dt \neq 0$：例如电磁铁的电流变化。
2. **面积变化** $dA/dt \neq 0$：例如导线框被拉伸或压缩。
3. **方向变化** $d\theta/dt \neq 0$：例如线圈在磁场中转动（发电机原理）。

学生常见误区是只看磁场是否大、忽视通量是否变。比如稳恒强磁场穿过静止线圈，感应电动势为零，因为磁通量不变。

## 计算示例

设半径 $r=0.05\,\text{m}$ 的圆形线圈位于均匀磁场 $B=0.4\,\text{T}$ 中，回路法线与磁场夹角 $\theta=60°$。则磁通量为
$$ \Phi_B = B \pi r^2 \cos 60° = 0.4 \times \pi \times 0.0025 \times 0.5 \approx 1.57 \times 10^{-3}\,\text{Wb}. $$

若线圈以 $\omega=10\,\text{rad/s}$ 匀速转动，$\theta(t) = \omega t$，则瞬时通量为
$$ \Phi_B(t) = B \pi r^2 \cos(\omega t). $$
